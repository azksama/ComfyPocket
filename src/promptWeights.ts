export type WeightedRange = {
  start: number;
  end: number;
  tag: string;
  weight: number;
};
export function weightRange(
  text: string,
  start: number,
  end = start,
): WeightedRange | null {
  if (start === end) {
    start =
      Math.max(
        text.lastIndexOf(",", start - 1),
        text.lastIndexOf("\n", start - 1),
      ) + 1;
    const stops = [text.indexOf(",", end), text.indexOf("\n", end)].filter(
      (n) => n >= 0,
    );
    end = stops.length ? Math.min(...stops) : text.length;
  }
  const raw = text.slice(start, end);
  const clean = raw.trim();
  start += raw.length - raw.trimStart().length;
  end = start + clean.length;
  if (!clean || /[,\n\r#]/.test(clean)) return null;
  const match = clean.match(/^\(([^()]+):([\d.]+)\)$/);
  const tag = match ? match[1] : clean;
  if (/[()<>]/.test(tag)) return null;
  return { start, end, tag, weight: match ? Number(match[2]) : 1 };
}
export function setTagWeight(
  text: string,
  range: WeightedRange,
  weight: number,
): string {
  if (!Number.isFinite(weight) || weight < 0 || weight > 3)
    throw Error("Invalid weight");
  const value = Math.round(weight * 100) / 100;
  return (
    text.slice(0, range.start) +
    (value === 1 ? range.tag : `(${range.tag}:${value})`) +
    text.slice(range.end)
  );
}
