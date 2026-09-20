import { mathlibSearchEnabled } from "./env.js";
import { pickLeanHit } from "./typeSafe.js";
import type { KnowledgeEntry } from "./types.js";

const SEARCH_URL = "https://leansearch.net/search";
const MATHLIB_RAW =
  "https://raw.githubusercontent.com/leanprover-community/mathlib4/master";
const SEARCH_MS = 4000;
const SOURCE_MS = 4000;
const MAX_SEARCH = 2;
export const LEAN_SNIPPET = 8_000;

export interface MathlibHit {
  lemma: string;
  informal: string;
  lean: string;
}

export function flattenLeanHits(raw: unknown): Array<{
  informal_name?: string;
  informal_description?: string;
  name?: unknown;
  module_name?: unknown;
  kind?: string;
}> {
  const out: Array<{
    informal_name?: string;
    informal_description?: string;
    name?: unknown;
    module_name?: unknown;
    kind?: string;
  }> = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as { result?: unknown };
    if (o.result && typeof o.result === "object") {
      out.push(o.result as (typeof out)[number]);
      return;
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(raw);
  return out;
}

export function claimMatchesHit(
  claim: string,
  hit: { informal_name?: string; informal_description?: string; name?: unknown },
): boolean {
  const q = tokens(claim);
  if (!q.size) return false;
  const hay = tokens(
    [hit.informal_name, hit.informal_description, lemmaName(hit.name)].join(" "),
  );
  const overlap = [...q].filter((t) => t.length > 3 && hay.has(t));
  if (overlap.length >= 2) return true;
  const iname = String(hit.informal_name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const qn = claim.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return Boolean(iname && (qn.includes(iname) || iname.includes(qn.slice(0, 48))));
}

export function mathlibModulePath(module: unknown): string | undefined {
  const parts = Array.isArray(module)
    ? module.map((p) => String(p ?? "").trim()).filter(Boolean)
    : String(module ?? "")
        .split(".")
        .map((p) => p.trim())
        .filter(Boolean);
  if (parts[0] !== "Mathlib") return undefined;
  if (parts.length < 2 || parts.length > 12) return undefined;
  if (parts.some((p) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(p))) return undefined;
  return `${parts.join("/")}.lean`;
}

export function extractLeanDecl(src: string, lemma: string): string | undefined {
  const name = lemma.split(".").filter(Boolean).pop();
  if (!name || !/^[A-Za-z][A-Za-z0-9_']*$/.test(name)) return undefined;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const head = new RegExp(
    String.raw`(?:theorem|lemma)\s+(?:_root_\.)?(?:[A-Za-z][A-Za-z0-9_']*\.)*${escaped}\b`,
  );
  const found = head.exec(src);
  if (!found || found.index == null) return undefined;
  const prefix = src.slice(0, found.index);
  let start = found.index;
  const docs = [...prefix.matchAll(/\/--[\s\S]*?-\//g)];
  const lastDoc = docs.at(-1);
  if (
    lastDoc &&
    lastDoc.index != null &&
    prefix.slice(lastDoc.index + lastDoc[0].length).trim() === ""
  ) {
    start = lastDoc.index;
  }
  const rest = src.slice(start);
  const stop = rest.slice(found.index - start + found[0].length).search(
    /\n(?:theorem|lemma|end |namespace |section |#)/,
  );
  const body = (stop >= 0 ? rest.slice(0, found.index - start + found[0].length + stop) : rest).trim();
  if (!body || body.length < 40) return undefined;
  return body.length <= LEAN_SNIPPET
    ? body
    : `${body.slice(0, LEAN_SNIPPET)}\n-- [truncated]`;
}

export function needsStandardWriteup(canonical: string | undefined): boolean {
  const t = canonical?.trim() ?? "";
  if (!t) return true;
  return !t.includes("$$");
}

export async function attachMathlibWriteups(
  updates: KnowledgeEntry[],
  opts?: {
    writeProof?: (hit: MathlibHit, claim: string) => Promise<string | undefined>;
  },
): Promise<KnowledgeEntry[]> {
  if (!mathlibSearchEnabled()) return updates;
  const jobs: Array<{ ui: number; ti: number; claim: string }> = [];
  updates.forEach((u, ui) => {
    (u.theorems ?? []).forEach((th, ti) => {
      if (th.status !== "proved") return;
      if (!needsStandardWriteup(th.canonical) && th.lemma) return;
      if (jobs.length >= MAX_SEARCH) return;
      jobs.push({ ui, ti, claim: th.claim });
    });
  });
  if (!jobs.length) return updates;
  const hits = await Promise.all(jobs.map((j) => searchClaim(j.claim)));
  const rendered = await Promise.all(
    hits.map(async (hit, i) => {
      if (!hit) return undefined;
      if (!opts?.writeProof) {
        return { lemma: hit.lemma, canonical: undefined as string | undefined };
      }
      const body = (await opts.writeProof(hit, jobs[i].claim))?.trim();
      if (!body) return { lemma: hit.lemma, canonical: undefined };
      return { lemma: hit.lemma, canonical: body };
    }),
  );
  return updates.map((u, ui) => {
    if (!u.theorems?.length) return u;
    const theorems = u.theorems.map((th, ti) => {
      const job = jobs.findIndex((j) => j.ui === ui && j.ti === ti);
      const found = job >= 0 ? rendered[job] : undefined;
      if (!found) return th;
      return {
        ...th,
        lemma: found.lemma,
        ...(found.canonical ? { canonical: found.canonical } : {}),
      };
    });
    return { ...u, theorems };
  });
}

async function searchClaim(claim: string): Promise<MathlibHit | undefined> {
  const q = claim.trim().slice(0, 200);
  if (q.length < 8) return undefined;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "study-helper-local",
      },
      body: JSON.stringify({ query: [q], num_results: 5 }),
      signal: AbortSignal.timeout(SEARCH_MS),
    });
    if (!res.ok) return undefined;
    const hits = flattenLeanHits(await res.json());
    const candidates: Array<{
      module: unknown;
      lemma: string;
      informal: string;
      raw: (typeof hits)[number];
    }> = [];
    for (const hit of hits) {
      if (hit.kind && hit.kind !== "theorem" && hit.kind !== "lemma") continue;
      const lemma = lemmaName(hit.name);
      const desc = String(hit.informal_description ?? "").trim();
      const iname = String(hit.informal_name ?? "").trim();
      const informal = (desc || iname).slice(0, 500);
      if (!informal || !lemma) continue;
      candidates.push({ module: hit.module_name, lemma, informal, raw: hit });
      if (candidates.length >= 5) break;
    }
    if (!candidates.length) return undefined;
    const picked = await pickLeanHit(
      q,
      candidates.map((c) => ({ lemma: c.lemma, informal: c.informal })),
    );
    let chosen: (typeof candidates)[number] | undefined;
    if (picked.kind === "index") chosen = candidates[picked.i];
    else if (picked.kind === "none") return undefined;
    else chosen = candidates.find((c) => claimMatchesHit(q, c.raw));
    if (!chosen) return undefined;
    const lean = await fetchLeanDecl(chosen.module, chosen.lemma);
    if (!lean) return undefined;
    return { lemma: chosen.lemma, informal: chosen.informal, lean };
  } catch {
    return undefined;
  }
  return undefined;
}

async function fetchLeanDecl(
  module: unknown,
  lemma: string,
): Promise<string | undefined> {
  const path = mathlibModulePath(module);
  if (!path) return undefined;
  try {
    const res = await fetch(`${MATHLIB_RAW}/${path}`, {
      headers: { "user-agent": "study-helper-local" },
      signal: AbortSignal.timeout(SOURCE_MS),
    });
    if (!res.ok) return undefined;
    return extractLeanDecl(await res.text(), lemma);
  } catch {
    return undefined;
  }
}

function lemmaName(name: unknown): string {
  if (Array.isArray(name)) return name.filter(Boolean).join(".");
  return String(name ?? "").trim();
}

function tokens(raw: string): Set<string> {
  return new Set(
    raw
      .toLowerCase()
      .replace(/\$[^$]*\$/g, " ")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2),
  );
}
