import { api } from "./api";
export async function modelMetadata(
  kind: string,
  names: string[],
  current: () => boolean = () => true,
) {
  const result: Record<string, string> = {};
  for (let i = 0; i < names.length && current(); i += 100) {
    const data = await api<{ items: { name: string; baseModel: string }[] }>(
      "/bridge/model-metadata",
      { kind, names: names.slice(i, i + 100) },
    );
    for (const item of data.items) result[item.name] = item.baseModel;
  }
  return result;
}
