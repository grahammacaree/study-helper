import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  invalidateCatalog,
  loadCatalog,
  type Catalog,
} from "./catalog.js";
import { projectRoot } from "./env.js";
import type { CourseMeta, Lecture } from "./types.js";

export interface InitCourseResult {
  course: CourseMeta;
  lectureCount: number;
  siteUpdated: boolean;
}

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

export function matchExistingCourse(
  courses: CourseMeta[],
  title: string,
): CourseMeta | undefined {
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

export async function initCourseFromUrl(rawUrl: string): Promise<InitCourseResult> {
  const sourceUrl = normalizeCourseUrl(rawUrl);
  const catalog = await loadCatalog();
  if (catalog.courses.some((c) => sameCourseUrl(c.sourceUrl, sourceUrl))) {
    throw new Error("That course is already in the catalog.");
  }

  const html = await fetchText(sourceUrl);
  const title = pageTitle(html) || slugFromUrl(sourceUrl);
  const instructors = pageInstructors(html);
  const id = uniqueId(catalog, slugFromUrl(sourceUrl));
  const lectures = await collectLectures(sourceUrl, html);
  const meta: CourseMeta = {
    id,
    title,
    instructors,
    sourceUrl,
    track: "currently",
    latest: lectures[0]?.n ?? 1,
  };

  const dir = join(projectRoot(), "courses", id);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "course.md"),
    [
      `# ${title}`,
      "",
      instructors,
      "",
      sourceUrl,
      "",
      "Initialised from the public course page. Concept tags are empty until you fill them in.",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(dir, "lectures.json"), `${JSON.stringify(lectures, null, 2)}\n`, "utf8");

  const indexPath = join(projectRoot(), "courses", "index.json");
  let index: { courses: CourseMeta[] } = { courses: [] };
  try {
    index = JSON.parse(await readFile(indexPath, "utf8")) as { courses: CourseMeta[] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
  if (!Array.isArray(index.courses)) index.courses = [];
  index.courses.push(meta);
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  invalidateCatalog();

  const siteUpdated = await maybeUpdatePersonalSite({
    title,
    href: sourceUrl,
    instructor: instructors,
  });
  return { course: meta, lectureCount: lectures.length, siteUpdated };
}

function normalizeCourseUrl(raw: string): string {
  let href = raw.trim();
  if (!href) throw new Error("Paste a course URL.");
  if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
  const u = new URL(href);
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("Course URL must be http(s).");
  }
  u.hash = "";
  let path = u.pathname.replace(/\/+$/, "");
  const ocw = /ocw\.mit\.edu$/i.test(u.hostname);
  if (ocw) {
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

function slugFromUrl(url: string): string {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("courses");
  const slug = i >= 0 ? parts[i + 1] : parts[parts.length - 1] || "course";
  const m = slug.match(/^(\d+)-(\d+[a-z]*)/i);
  if (m) {
    const name = slug
      .replace(/^\d+-\d+[a-z]*-?/i, "")
      .replace(/-(fall|spring|summer|winter)-\d{4}$/i, "")
      .slice(0, 32);
    return name ? `${name}-${m[1]}${m[2]}`.toLowerCase() : `${m[1]}-${m[2]}`.toLowerCase();
  }
  return slug.replace(/[^a-z0-9-]+/gi, "-").slice(0, 48).toLowerCase();
}

function uniqueId(catalog: Catalog, base: string): string {
  if (!catalog.courses.some((c) => c.id === base)) return base;
  let n = 2;
  while (catalog.courses.some((c) => c.id === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function pageTitle(html: string): string {
  const og = /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i.exec(html)
    ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i.exec(html);
  const title = /<title[^>]*>([^<]+)/i.exec(html);
  const raw = (og?.[1] || title?.[1] || "")
    .replace(/\s*\|\s*MIT OpenCourseWare.*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return decode(raw);
}

function pageInstructors(html: string): string {
  const m =
    /Instructors?:\s*<\/[^>]+>\s*([^<]{3,120})/i.exec(html) ||
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)/i.exec(html);
  return decode((m?.[1] || "See course page").replace(/\s+/g, " ").trim());
}

async function collectLectures(sourceUrl: string, homeHtml: string): Promise<Lecture[]> {
  const candidates = [
    joinUrl(sourceUrl, "pages/calendar/"),
    joinUrl(sourceUrl, "pages/lecture-notes/"),
    joinUrl(sourceUrl, "pages/video-lectures/"),
    joinUrl(sourceUrl, "lectures.html"),
    joinUrl(sourceUrl, "lecture-videos"),
    sourceUrl,
  ];
  const seenHtml = new Set<string>();
  let lectures: Lecture[] = parseLectureList(homeHtml, sourceUrl);
  for (const url of candidates) {
    if (seenHtml.has(url)) continue;
    seenHtml.add(url);
    try {
      const html = url === sourceUrl ? homeHtml : await fetchText(url);
      const found = parseLectureList(html, url);
      if (found.length > lectures.length) lectures = found;
    } catch {
      /* try the next page */
    }
  }
  if (!lectures.length) {
    lectures = [
      {
        n: 1,
        title: "Lecture 1",
        url: sourceUrl,
        conceptIds: [],
      },
    ];
  }
  return lectures;
}

function joinUrl(base: string, path: string): string {
  const u = new URL(base);
  const root = u.pathname.replace(/\/+$/, "");
  u.pathname = `${root}/${path.replace(/^\/+/, "")}`;
  return u.toString();
}

function parseLectureList(html: string, pageUrl: string): Lecture[] {
  const stripped = html.replace(/<script[\s\S]*?<\/script>/gi, " ");
  const byN = new Map<number, Lecture>();

  const row =
    /<(?:td|th)[^>]*>\s*(?:<[^>]+>\s*)*(?:L(?:ec(?:ture)?)?\.?\s*)(\d{1,2})\s*(?:<[^>]+>\s*)*<\/t[dh]>[\s\S]{0,800}?<(?:td|th)[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  for (const match of stripped.matchAll(row)) {
    addLecture(byN, Number(match[1]), cellText(match[2]), pageUrl);
  }

  const labeled =
    /(?:Lecture|Lec\.?)\s+(\d{1,2})\s*[:.\-–]\s*([^<\n]{3,90})/gi;
  for (const match of stripped.matchAll(labeled)) {
    addLecture(byN, Number(match[1]), match[2], pageUrl);
  }

  const ses = /\bL(\d{1,2})\b[^A-Za-z0-9]{0,12}([^<\n]{6,80})/g;
  for (const match of stripped.matchAll(ses)) {
    addLecture(byN, Number(match[1]), match[2], pageUrl);
  }

  return [...byN.values()].sort((a, b) => a.n - b.n);
}

function addLecture(
  byN: Map<number, Lecture>,
  n: number,
  titleRaw: string,
  url: string,
): void {
  if (!Number.isInteger(n) || n < 1 || n > 80) return;
  const title = decode(titleRaw)
    .replace(/\s+/g, " ")
    .replace(/^(lecture|lec\.?|l)\s*\d+\s*[:.\-–]?\s*/i, "")
    .trim();
  if (title.length < 3) return;
  if (/^(recitation|exam|quiz|holiday|no class)/i.test(title)) return;
  const prior = byN.get(n);
  if (!prior || title.length > prior.title.length) {
    byN.set(n, { n, title: title.slice(0, 120), url, conceptIds: [] });
  }
}

function cellText(html: string): string {
  const first = html.split(/<br\s*\/?>/i)[0] ?? html;
  return first.replace(/<[^>]+>/g, " ");
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "study-helper-local" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Could not fetch course page (${res.status}).`);
  return res.text();
}

async function maybeUpdatePersonalSite(course: {
  title: string;
  href: string;
  instructor: string;
}): Promise<boolean> {
  const path = join(projectRoot(), "local", "personal-site.ts");
  try {
    const mod = (await import(pathToFileURL(path).href)) as {
      onCourseInit?: (c: typeof course) => Promise<boolean>;
    };
    if (typeof mod.onCourseInit !== "function") return false;
    return Boolean(await mod.onCourseInit(course));
  } catch {
    return false;
  }
}
