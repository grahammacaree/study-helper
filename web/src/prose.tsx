import { memo, type ReactNode } from "react";
import katex from "katex";
import { splitMathEnvs } from "./texDisplay";

export const Prose = memo(function Prose({
  text,
  onConcept,
}: {
  text: string;
  onConcept?: (id: string) => void;
}) {
  const trimmed = tidy(text);
  if (!trimmed) return null;
  const nodes: ReactNode[] = [];
  const ink = (s: string, seed = 0) => inline(s, seed, onConcept);
  parseSegments(trimmed).forEach((seg, key) => {
    if (seg.kind === "h") {
      const Tag = seg.level <= 2 ? "h2" : seg.level === 3 ? "h3" : "h4";
      nodes.push(<Tag key={key}>{ink(seg.text)}</Tag>);
      return;
    }
    if (seg.kind === "ul") {
      nodes.push(
        <ul key={key}>
          {seg.items.map((item, n) => (
            <li key={n}>{ink(item)}</li>
          ))}
        </ul>,
      );
      return;
    }
    if (seg.kind === "ol") {
      nodes.push(
        <ol key={key}>
          {seg.items.map((item, n) => (
            <li key={n}>{ink(item)}</li>
          ))}
        </ol>,
      );
      return;
    }
    if (seg.kind === "math") {
      nodes.push(mathNode(seg.tex, true, key));
      return;
    }
    if (seg.kind === "proof") {
      nodes.push(
        <div key={key} className="proof-block">
          <ol className="proof-steps">
            {seg.steps.map((step, n) => {
              const last = n === seg.steps.length - 1;
              return (
                <li key={n}>
                  <span className="proof-n">{n + 1}.</span>
                  <div className="proof-line">
                    <div className="proof-tex">
                      {mathNode(
                        last ? withQed(step.tex) : step.tex,
                        true,
                        `${key}-${n}`,
                        last ? "proof-qed" : undefined,
                      )}
                    </div>
                    {step.crib ? (
                      <p className="proof-crib">{ink(step.crib, key + n + 1)}</p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>,
      );
      return;
    }
    nodes.push(<p key={key}>{ink(seg.text)}</p>);
  });
  return <>{nodes}</>;
}, (prev, next) => prev.text === next.text);

type Seg =
  | { kind: "h"; level: number; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "p"; text: string }
  | { kind: "math"; tex: string }
  | { kind: "proof"; steps: { tex: string; crib?: string }[]; qed?: boolean };

const STEP =
  /^(\d+)[.)][ \t]*\n+\$\$([\s\S]+?)\$\$((?:\n*\*[^*\n]+\*[ \t]*)*)\n*/;

function parseSegments(src: string): Seg[] {
  const segs: Seg[] = [];
  let rest = src.trim();
  while (rest) {
    rest = rest.replace(/^\n+/, "");
    if (!rest) break;
    const heading = /^(#{1,4})\s+(.+?)(?:\n|$)/.exec(rest);
    if (heading) {
      segs.push({ kind: "h", level: heading[1].length, text: heading[2].trim() });
      rest = rest.slice(heading[0].length);
      continue;
    }
    if (STEP.test(rest)) {
      const steps: { tex: string; crib?: string }[] = [];
      while (STEP.test(rest)) {
        const m = STEP.exec(rest);
        if (!m) break;
        steps.push({ tex: m[2].trim(), crib: joinCribLine(cribLabels(m[3] ?? "")) });
        rest = rest.slice(m[0].length);
      }
      rest = rest.replace(/^\n+/, "");
      const qedMark = /^(∎|□|QED)\s*(?:\n|$)/i.exec(rest);
      if (qedMark) rest = rest.slice(qedMark[0].length);
      segs.push({ kind: "proof", steps, qed: true });
      continue;
    }
    const math = /^\$\$([\s\S]+?)\$\$/.exec(rest);
    if (math) {
      segs.push({ kind: "math", tex: math[1] });
      rest = rest.slice(math[0].length);
      continue;
    }
    if (/^[-*•]\s+/.test(rest)) {
      const block = /^(?:[-*•]\s+.+\n?)+/.exec(rest);
      if (block) {
        segs.push({
          kind: "ul",
          items: block[0]
            .trim()
            .split("\n")
            .map((line) => line.replace(/^\s*[-*•]\s+/, "")),
        });
        rest = rest.slice(block[0].length);
        continue;
      }
    }
    if (/^\d+[.)]\s+\S/.test(rest)) {
      const block = /^(?:\d+[.)]\s+.+\n?)+/.exec(rest);
      if (block) {
        segs.push({
          kind: "ol",
          items: block[0]
            .trim()
            .split("\n")
            .map((line) => line.replace(/^\s*\d+[.)]\s+/, "")),
        });
        rest = rest.slice(block[0].length);
        continue;
      }
    }
    const cut = rest.search(/\n\n|\$\$|\n#{1,4}\s|\n[-*•]\s|\n\d+[.)][ \t]*\n/);
    const take = (cut >= 0 ? rest.slice(0, cut) : rest).trim();
    if (take) segs.push({ kind: "p", text: take });
    rest = cut >= 0 ? rest.slice(cut) : "";
  }
  return segs;
}

function cribLabels(raw: string): string[] {
  return [...raw.matchAll(/\*([^*\n]+)\*/g)]
    .flatMap((m) => m[1].split(/\s*;\s*/))
    .map((part) => part.trim())
    .filter(Boolean);
}

function joinCribLine(labels: string[]): string | undefined {
  if (labels.length === 1 && /\sand\s/i.test(labels[0].replace(/^by\s+/i, ""))) {
    const t = labels[0].replace(/^by\s+/i, "").trim();
    return t ? `by ${t}` : undefined;
  }
  const named: string[] = [];
  let simp = "";
  for (const label of labels) {
    const t = label.replace(/^by\s+/i, "").trim();
    if (!t) continue;
    if (/^(simplification|simplifying\b|noting\b)/i.test(t)) {
      simp = "noting $\\sigma$ and $\\varepsilon$ as constants";
      continue;
    }
    if (!named.includes(t)) named.push(t);
  }
  const parts = simp ? [...named, simp] : named;
  if (!parts.length) return undefined;
  if (parts.length === 1) return `by ${parts[0]}`;
  if (parts.length === 2) return `by ${parts[0]} and ${parts[1]}`;
  return `by ${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function tidy(text: string): string {
  return wrapBareTex(
    text
      .trim()
      .replace(/\*{3,}/g, "**")
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => `$$${m}$$`)
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => `$${m}$`),
  );
}

const BARE_TEX =
  /^(?:\\[a-zA-Z]+(?:\s*\{[^{}]*\})*|[A-Za-z][A-Za-z0-9]*(?:\^\{[^{}]+\}|\^[0-9A-Za-z]+|\_\{[^{}]+\}|\_[0-9A-Za-z])+)/;

function wrapBareTex(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("$$", i)) {
      const end = text.indexOf("$$", i + 2);
      if (end >= 0) {
        out += text.slice(i, end + 2);
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "$" && text[i + 1] !== "$") {
      const end = nextUnescapedDollar(text, i + 1);
      if (end > i) {
        out += text.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        out += text.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    const m = BARE_TEX.exec(text.slice(i));
    if (m) {
      out += `$${m[0]}$`;
      i += m[0].length;
      continue;
    }
    out += text[i];
    i += 1;
  }
  return out;
}

function nextUnescapedDollar(text: string, from: number): number {
  for (let j = from; j < text.length; j += 1) {
    if (text[j] !== "$" || text[j - 1] === "\\") continue;
    if (text[j + 1] === "$") continue;
    return j;
  }
  return -1;
}

function inline(
  text: string,
  seed = 0,
  onConcept?: (id: string) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < text.length) {
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        nodes.push(
          <code key={`${seed}-${k}`}>{text.slice(i + 1, end)}</code>,
        );
        k += 1;
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        const inner = text.slice(i + 2, end).replace(/^\*+|\*+$/g, "");
        nodes.push(
          <strong key={`${seed}-${k}`}>
            {inline(inner, seed + k + 1, onConcept)}
          </strong>,
        );
        k += 1;
        i = end + 2;
        continue;
      }
      i += 2;
      continue;
    }
    if (text[i] === "*" && text[i + 1] !== "*") {
      const end = nextSingleStar(text, i + 1);
      if (end > i + 1) {
        nodes.push(
          <em key={`${seed}-${k}`}>
            {inline(text.slice(i + 1, end), seed + k + 1, onConcept)}
          </em>,
        );
        k += 1;
        i = end + 1;
        continue;
      }
      nodes.push("*");
      i += 1;
      continue;
    }
    if (text[i] === "$" && text[i + 1] !== "$") {
      const end = nextUnescapedDollar(text, i + 1);
      if (end > i + 1) {
        nodes.push(mathNode(text.slice(i + 1, end), false, `${seed}-m-${k}`));
        k += 1;
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "[") {
      const concept = /^\[([^\]]+)\]\(concept:([a-z0-9][a-z0-9-]{0,63})\)/i.exec(
        text.slice(i),
      );
      if (concept) {
        const id = concept[2];
        nodes.push(
          <a
            key={`${seed}-${k}`}
            href={`#concept/${id}`}
            onClick={(e) => {
              e.preventDefault();
              onConcept?.(id);
            }}
          >
            {concept[1]}
          </a>,
        );
        k += 1;
        i += concept[0].length;
        continue;
      }
      const link = /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(text.slice(i));
      if (link) {
        nodes.push(
          <a
            key={`${seed}-${k}`}
            href={link[2]}
            target="_blank"
            rel="noreferrer"
          >
            {link[1]}
          </a>,
        );
        k += 1;
        i += link[0].length;
        continue;
      }
    }
    let j = i + 1;
    while (j < text.length && !isMarkupStart(text, j)) j += 1;
    nodes.push(text.slice(i, j));
    i = j;
  }
  return nodes;
}

function isMarkupStart(text: string, i: number): boolean {
  const ch = text[i];
  return ch === "`" || ch === "$" || ch === "[" || ch === "*";
}

function nextSingleStar(text: string, from: number): number {
  let j = from;
  while (j < text.length) {
    if (text[j] === "*" && text[j + 1] !== "*") return j;
    if (text[j] === "*" && text[j + 1] === "*") {
      j += 2;
      continue;
    }
    j += 1;
  }
  return -1;
}

function withQed(tex: string): string {
  const t = tex.trim();
  if (/\\square\s*$/.test(t) || /\\square\s*\\end\{/.test(t)) return t;
  if (/\\end\{gathered\}\s*$/.test(t)) {
    return t.replace(
      /\\end\{gathered\}\s*$/,
      "\\quad\\square\n\\end{gathered}",
    );
  }
  return `${t}\\quad\\square`;
}

function displayHtml(tex: string): string {
  return katex.renderToString(tex, {
    throwOnError: false,
    displayMode: true,
    fleqn: true,
  });
}

function mathNode(
  tex: string,
  display: boolean,
  key: string | number,
  extraClass?: string,
): ReactNode {
  const box = extraClass ? `tex-block ${extraClass}` : "tex-block";
  if (display) {
    const chunks = splitMathEnvs(tex);
    if (chunks.length > 1) {
      return (
        <div key={key} className="tex-proof">
          {chunks.map((chunk, i) => (
            <div
              key={i}
              className={i === chunks.length - 1 ? box : "tex-block"}
              dangerouslySetInnerHTML={{ __html: displayHtml(chunk) }}
            />
          ))}
        </div>
      );
    }
  }
  const html = display
    ? displayHtml(tex)
    : katex.renderToString(tex, {
        throwOnError: false,
        displayMode: false,
      });
  if (display) {
    return (
      <div
        key={key}
        className={box}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <span
      key={key}
      className="tex-inline"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
