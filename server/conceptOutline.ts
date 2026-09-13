/** Host-side beats shown while a missing teaching file is written. */
export function seedConceptOutline(
  name: string,
  parentName?: string,
  relatedNames: string[] = [],
): string[] {
  const beats = [
    `Getting ${name} straight`,
    "When you'd actually use this",
    "The mix-up that usually bites",
  ];
  if (parentName) beats.push(`How this hangs off ${parentName}`);
  const hop = relatedNames.filter((n) => n !== name).slice(0, 2);
  if (hop.length === 1) beats.push(`And ${hop[0]} nearby`);
  else if (hop.length > 1) beats.push(`And ${hop[0]}, ${hop[1]} nearby`);
  return beats;
}

export function asOutline(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const row of value) {
    const line = String(row ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(\S)/, (ch) => ch.toUpperCase());
    if (!line || line.length > 100) continue;
    if (out.includes(line)) continue;
    out.push(line);
    if (out.length >= 8) break;
  }
  return out;
}
