"""Short-lived PC inference worker. Stdout carries bounded JSON events only."""
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import urllib.request

ROOT = Path(sys.argv[1]).resolve()
MANIFEST = json.loads(Path(__file__).with_name("assistant-models.json").read_text("utf-8"))


def emit(**value):
    print(json.dumps(value, ensure_ascii=True), flush=True)


def folder(key):
    return ROOT / "models" / key


def verify(key):
    for part in MANIFEST[key]["files"]:
        file = folder(key) / part["path"]
        if not file.is_file() or file.stat().st_size != part["size"]:
            return False
        h = hashlib.new(part["algorithm"])
        if part["algorithm"] == "sha1":
            h.update(f"blob {part['size']}\0".encode())
        with file.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                h.update(chunk)
        if h.hexdigest() != part["digest"]:
            return False
    return True


def download(keys):
    total = sum(p["size"] for key in keys for p in MANIFEST[key]["files"])
    ROOT.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(ROOT).free < total + 1024**3:
        raise RuntimeError("Espace disque insuffisant sur le PC.")
    done = 0
    for key in keys:
        spec = MANIFEST[key]
        for part in spec["files"]:
            dest = folder(key) / part["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            temp = dest.with_name(dest.name + ".partial")
            h = hashlib.new(part["algorithm"])
            if part["algorithm"] == "sha1":
                h.update(f"blob {part['size']}\0".encode())
            url = f"https://huggingface.co/{spec['repo']}/resolve/{spec['revision']}/{part['path']}"
            received = 0
            try:
                with urllib.request.urlopen(url, timeout=30) as response, temp.open("wb") as out:
                    while chunk := response.read(1024 * 1024):
                        received += len(chunk)
                        if received > part["size"]:
                            raise RuntimeError("Fichier de modèle trop volumineux.")
                        out.write(chunk)
                        h.update(chunk)
                        emit(phase="downloading", received=done + received, size=total)
                if received != part["size"] or h.hexdigest() != part["digest"]:
                    raise RuntimeError("Le modèle téléchargé ne correspond pas à la version attendue.")
                temp.replace(dest)
            finally:
                temp.unlink(missing_ok=True)
            done += received
        (folder(key) / "installed.json").write_text(json.dumps({"revision": spec["revision"]}), "utf-8")
    emit(phase="complete", received=total, size=total)


def infer(job):
    # No model or executable code can be fetched during inference.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    import numpy as np
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoModelForSeq2SeqLM, AutoModelForPreTraining, AutoProcessor, AutoTokenizer

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    device = "cuda" if job["device"] != "cpu" and torch.cuda.is_available() else "cpu"
    if job["device"] == "cuda" and device != "cuda":
        raise RuntimeError("Le GPU CUDA n’est pas disponible sur ce PC.")
    if job["device"] == "auto" and device == "cuda":
        required = (6 if job.get("model") == "large-v3" else 3) * 1024**3
        if torch.cuda.mem_get_info()[0] < required:
            device = "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32
    emit(phase="processing", device=device)

    def checked(key):
        if not verify(key):
            raise RuntimeError("Modèle absent ou modifié. Téléchargez-le à nouveau depuis les paramètres.")
        return str(folder(key))

    if job["action"] == "transcribe":
        location = checked(job["model"])
        audio = np.frombuffer(base64.b64decode(job["audio"], validate=True), dtype="<i2").astype(np.float32) / 32768
        processor = AutoProcessor.from_pretrained(location, local_files_only=True)
        model = AutoModelForSpeechSeq2Seq.from_pretrained(location, torch_dtype=dtype, use_safetensors=True, local_files_only=True).to(device)
        inputs = processor(audio, sampling_rate=16000, return_tensors="pt", return_attention_mask=True)
        inputs = {k: v.to(device=device, dtype=dtype if v.is_floating_point() else v.dtype) for k, v in inputs.items()}
        with torch.inference_mode():
            ids = model.generate(**inputs, language=job["language"], task="translate" if job["language"] == "fr" else "transcribe", max_new_tokens=256, do_sample=False)
        text = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
        emit(phase="complete", text=text, device=device)
        return

    text = job["description"]
    if job["language"] == "fr":
        location = checked("fr-en")
        tokenizer = AutoTokenizer.from_pretrained(location, local_files_only=True)
        translator = AutoModelForSeq2SeqLM.from_pretrained(location, use_safetensors=True, local_files_only=True).to(device)
        inputs = tokenizer(text, return_tensors="pt", truncation=False).to(device)
        if inputs.input_ids.shape[-1] > 500:
            raise RuntimeError("Cette description est trop longue. Traitez un bloc à la fois.")
        with torch.inference_mode():
            text = tokenizer.decode(translator.generate(**inputs, max_new_tokens=512)[0], skip_special_tokens=True)
        del translator, inputs
        if device == "cuda":
            torch.cuda.empty_cache()

    location = checked("danbot")
    # Only the reviewed, hash-checked Python files of the pinned repository are loaded.
    processor = AutoProcessor.from_pretrained(location, trust_remote_code=True, local_files_only=True)
    model = AutoModelForPreTraining.from_pretrained(location, trust_remote_code=True, local_files_only=True, use_safetensors=True, torch_dtype=torch.bfloat16 if device == "cuda" else torch.float32).to(device)
    prompt = processor.decoder_tokenizer.apply_chat_template({"aspect_ratio": "square", "rating": "general", "length": "very_short", "translate_mode": "exact"}, tokenize=False)
    inputs = processor(encoder_text=text, decoder_text=prompt, return_tensors="pt").to(device)
    if inputs.input_ids.shape[-1] > 2048:
        raise RuntimeError("Cette description est trop longue. Traitez un bloc à la fois.")
    with torch.inference_mode():
        ids = model.generate(**inputs, max_new_tokens=256, do_sample=False, eos_token_id=processor.decoder_tokenizer.convert_tokens_to_ids("</translation>"))
    tokens = processor.decoder_tokenizer.convert_ids_to_tokens(ids[0, inputs.input_ids.shape[-1]:].tolist(), skip_special_tokens=True)
    tags = list(dict.fromkeys(tag.strip().replace(" ", "_") for tag in tokens if tag.strip() and not (tag.startswith("<") and tag.endswith(">"))))
    if not tags:
        raise RuntimeError("Aucun tag proposé. Précisez votre description.")
    emit(phase="complete", text=text, device=device, blocks=[{"title": "DanbotNL", "text": ", ".join(tags), "side": job["side"]}])


if __name__ == "__main__":
    try:
        job = json.loads(sys.stdin.buffer.read(3 * 1024 * 1024))
        if job["action"] == "download":
            download(job["keys"])
        else:
            infer(job)
    except Exception as error:
        emit(phase="error", error=str(error)[:1500])
        sys.exit(1)
