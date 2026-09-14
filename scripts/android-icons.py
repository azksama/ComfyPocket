"""Copy the supplied Android icons without resizing or changing image bytes."""
import hashlib, json, pathlib, shutil, struct, sys
source = pathlib.Path(sys.argv[1])
root = pathlib.Path(__file__).resolve().parents[1]
res = root / 'src-tauri/gen/android/app/src/main/res'
archive = root / 'assets/android-icons'
archive.mkdir(parents=True, exist_ok=True)
density = {48: 'mdpi', 72: 'hdpi', 96: 'xhdpi', 144: 'xxhdpi', 192: 'xxxhdpi'}
files = ['ic_launcher.png', 'ic_launcher (1).png', 'ic_launcher (3).png', 'ic_launcher (5).png', 'ic_launcher (7).png', 'ic_launcher_round.png', 'ic_launcher_round (2).png', 'ic_launcher_round (4).png', 'ic_launcher_round (6).png', 'ic_launcher_round (8).png', 'play_store_512.png']
proof = []
for name in files:
    file = source / name
    data = file.read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n': raise ValueError('PNG expected')
    width, height = struct.unpack('>II', data[16:24])
    if width != height: raise ValueError('Square icon expected')
    if name == 'play_store_512.png':
        target = archive / name
    else:
        folder = res / ('mipmap-' + density[width])
        folder.mkdir(exist_ok=True)
        filename = 'ic_launcher_round.png' if 'round' in name else 'ic_launcher.png'
        target = folder / filename
        (archive / density[width]).mkdir(exist_ok=True)
        shutil.copyfile(file, archive / density[width] / filename)
    shutil.copyfile(file, target)
    proof.append(dict(file=name, size=width, resource=str(target.relative_to(root)), sha256=hashlib.sha256(data).hexdigest()))
(archive / 'manifest.json').write_text(json.dumps(proof, indent=2), encoding='utf-8')
print('Copied and verified', len(proof), 'original icon files')
