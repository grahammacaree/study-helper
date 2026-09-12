import type { ReactNode } from "react";
import katex from "katex";

export function Prose({
  text,
  onConcept,
}: {
  text: string;
  onConcept?: (id: string) => void;
}) {
  const trimmed = tidy(text);
  if (!trimmed) return null;
  const blocks = splitDisplayMath(trimmed);
  const nodes: ReactNode[] = [];
  let key = 0;
  const ink = (s: string, seed = 0) => inline(s, seed, onConcept);
  for (const block of blocks) {
    if (block.math) {
      nodes.push(mathNode(block.math, true, key));
      key += 1;
      continue;
    }
    const lines = block.text.split("\n");
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }
      const heading = /^(#{1,4})\s+(.+)$/.exec(line);
      if (heading) {
        const Tag = heading[1].length <= 2 ? "h2" : "h3";
        nodes.push(<Tag key={key}>{ink(heading[2].trim())}</Tag>);
        key += 1;
        i += 1;
        continue;
      }
      if (/^\s*[-*•]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
          i += 1;
        }
        nodes.push(
          <ul key={key}>
            {items.map((item, n) => (
              <li key={n}>{ink(item)}</li>
            ))}
          </ul>,
        );
        key += 1;
        continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items: string[] = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ""));
          i += 1;
        }
        nodes.push(
          <ol key={key}>
            {items.map((item, n) => (
              <li key={n}>{ink(item)}</li>
            ))}
          </ol>,
        );
        key += 1;
        continue;
      }
      nodes.push(<p key={key}>{ink(line.trim())}</p>);
      key += 1;
      i += 1;
    }
  }
  return <>{nodes}</>;
}

function tidy(text: string): string {
  return text.trim().replace(/\*{3,}/g, "**");
}

function splitDisplayMath(text: string): { text: string; math?: string }[] {
  const parts: { text: string; math?: string }[] = [];
  const re = /\$\$([\s\S]+?)\$\$/g;
  let last = 0;
  for (const match of text.matchAll(re)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: "", math: match[1] });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
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
      const end = text.indexOf("$", i + 1);
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

function mathNode(tex: string, display: boolean, key: string | number): ReactNode {
  const html = katex.renderToString(tex, {
    throwOnError: false,
    displayMode: display,
  });
  if (display) {
    return (
      <div
        key={key}
        className="tex-block"
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
