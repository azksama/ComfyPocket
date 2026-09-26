import { createRoot } from "react-dom/client";
import ModelImports from "../src/ModelImports";
import { ModelPicker } from "../src/ModelPicker";
import "../src/styles.css";
import "../src/experience.css";
import "../src/mochi.css";
import "../src/mobile.css";
createRoot(document.getElementById("root")!).render(
  location.search.includes("loras") ? (
    <ModelPicker
      title="LoRA"
      checkpoint="studio.safetensors"
      kind="loras"
      names={["illust.safetensors", "pony.safetensors", "unknown.safetensors"]}
      value=""
      onSelect={() => {}}
      onClose={() => {}}
    />
  ) : (
    <ModelImports
      state={{
        snapshot: { revision: 0, jobs: [] },
        error: "",
        syncError: "",
        supported: true,
        browserSupported: true,
        refresh: async () => {},
      }}
      onClose={() => {}}
    />
  ),
);
