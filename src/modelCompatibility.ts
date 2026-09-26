export function modelFamily(base: string): string {
  const value = base.toLowerCase().replace(/[_.\s-]+/g, "");
  if (!value || value === "unknown") return "";
  if (value.includes("illustrious")) return "illustrious";
  if (value.includes("noobai")) return "noobai";
  if (value.includes("pony")) return "pony";
  if (value.includes("sdxl") || value.includes("stablediffusionxl"))
    return "sdxl";
  if (/sd1[45]|stablediffusionv1/.test(value)) return "sd1";
  if (/sd2|stablediffusionv2/.test(value)) return "sd2";
  // Preserve distinctions for newer architectures rather than guessing.
  return value;
}
export function compatibleModel(base: string, candidate: string): boolean {
  const family = modelFamily(base);
  return !!family && family === modelFamily(candidate);
}
