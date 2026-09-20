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

export function matchExistingCourse<
  T extends { id: string; title: string; sourceUrl?: string },
>(courses: T[], query: string): T | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const byName = courses.find(
    (c) =>
      c.id === slug ||
      c.title.toLowerCase() === lower ||
      c.id.replace(/-/g, " ") === lower,
  );
  if (byName) return byName;
  if (!looksLikeCourseUrl(trimmed)) return undefined;
  try {
    const href = normalizeCourseUrl(trimmed);
    return courses.find(
      (c) => c.sourceUrl && sameCourseUrl(c.sourceUrl, href),
    );
  } catch {
    return undefined;
  }
}

function normalizeCourseUrl(raw: string): string {
  let href = raw.trim();
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
  const u = new URL(href);
  u.hash = "";
  let path = u.pathname.replace(/\/+$/, "");
  if (/ocw\.mit\.edu$/i.test(u.hostname)) {
    const pages = path.indexOf("/pages/");
    if (pages > 0) path = path.slice(0, pages);
    u.search = "";
  }
  u.pathname = path;
  return u.toString();
}

function sameCourseUrl(a: string, b: string): boolean {
  try {
    return normalizeCourseUrl(a) === normalizeCourseUrl(b);
  } catch {
    return a === b;
  }
}
