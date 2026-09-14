/** A recap sitting on the calendar is not a place you meet a new idea. */
export function isReviewLectureTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (/\b(course|curriculum)\s+synthesis\b/.test(t)) return true;
  return /\breview\b/.test(t);
}

/**
 * A library node is a definition, structure, technique, or theorem you can
 * meet again — not a recap, quiz review, or "the course so far".
 */
export function isStudyConcept(name: string, id = ""): boolean {
  const t = `${id} ${name}`
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ");
  if (!t) return false;
  if (/\b(course|curriculum)\s+synthesis\b/.test(t)) return false;
  if (/\b(quiz|exam|midterm|final)\s+\d*\s*review\b/.test(t)) return false;
  if (/\breview\s+(quiz|exam|lecture|session)\b/.test(t)) return false;
  if (/^(quiz|exam|midterm|final)\s+review$/.test(t)) return false;
  return true;
}
