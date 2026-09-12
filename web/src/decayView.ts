export function decayClass(freshness: number | undefined): string {
  if (freshness == null || freshness < 0.65) return "";
  return "decay-fresh";
}
