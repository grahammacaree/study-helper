export function looksLikeCourseUrl(raw: string): boolean {
  const href = raw.trim();
  if (!href || /\s/.test(href)) return false;
  if (/^https?:\/\//i.test(href)) return true;
  try {
    const u = new URL(`https://${href}`);
    return Boolean(u.hostname.includes("."));
  } catch {
    return false;
  }
}

export function matchExistingCourse<T extends { id: string; title: string }>(
  courses: T[],
  title: string,
): T | undefined {
  const trimmed = title.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return courses.find(
    (c) =>
      c.id === slug ||
      c.title.toLowerCase() === lower ||
      c.id.replace(/-/g, " ") === lower,
  );
}
