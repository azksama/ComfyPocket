export const shortName = (s: string) =>
  s
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(safetensors|ckpt|pt|pth)$/i, "")
    .replace(/_/g, " ");
export const modelPath = (kind: string, name: string) =>
  "/bridge/model-preview?" + new URLSearchParams({ kind, name });
