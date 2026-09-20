/** A recap sitting on the calendar is not a place you meet a new idea. */
export function isReviewLectureTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (/\b(course|curriculum)\s+synthesis\b/.test(t)) return true;
  return /\breview\b/.test(t);
}

/**
 * Independently citable named results. Two of these in one leaf name means
 * the mapper mashed a lecture title. Family buckets ("Limit theorems") and
 * duals of one operator (Adam/Eve) are not on this list.
 */
const CITABLE_RESULTS: Array<{ key: string; pattern: RegExp }> = [
  { key: "lln", pattern: /\b(lln|wlln|slln|law of large numbers)\b/ },
  { key: "clt", pattern: /\b(clt|central limit theorem)\b/ },
  { key: "bfs", pattern: /\b(bfs|breadth[- ]first search)\b/ },
  { key: "dfs", pattern: /\b(dfs|depth[- ]first search)\b/ },
  { key: "dijkstra", pattern: /\bdijkstra\b/ },
  { key: "bellman-ford", pattern: /\bbellman[–-]?ford\b/ },
  { key: "markov-inequality", pattern: /\bmarkov(?:['’]s)? inequality\b/ },
  { key: "chebyshev", pattern: /\bchebyshev\b/ },
];

function foldedConceptLabel(name: string, id = ""): string {
  return `${id} ${name}`
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ");
}

export function citableResultKeys(name: string, id = ""): string[] {
  const t = foldedConceptLabel(name, id);
  return CITABLE_RESULTS.filter((row) => row.pattern.test(t)).map((row) => row.key);
}

/** Keys when a node name fuses two independently citable results. Empty if grain is fine. */
export function fusedCitableResults(name: string, id = ""): string[] {
  const keys = citableResultKeys(name, id);
  return keys.length >= 2 ? keys : [];
}

/**
 * A library node is a definition, structure, technique, or theorem you can
 * meet again — not a recap, quiz review, or "the course so far".
 */
export function isStudyConcept(name: string, id = ""): boolean {
  const t = foldedConceptLabel(name, id);
  if (!t) return false;
  if (/\b(course|curriculum)\s+synthesis\b/.test(t)) return false;
  if (/\b(quiz|exam|midterm|final)\s+\d*\s*review\b/.test(t)) return false;
  if (/\breview\s+(quiz|exam|lecture|session)\b/.test(t)) return false;
  if (/^(quiz|exam|midterm|final)\s+review$/.test(t)) return false;
  return true;
}
