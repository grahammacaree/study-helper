/**
 * Host checks before accepting a teaching note. A single stray `$` unbalances
 * every later delimiter and trashes the concept library render.
 */

export function teachingFormatIssues(text: string): string[] {
  const issues: string[] = [];
  let i = 0;
  let inlineAt = -1;
  let displayAt = -1;
  while (i < text.length) {
    if (text.startsWith("```", i)) {
      const end = text.indexOf("```", i + 3);
      if (end < 0) {
        issues.push("unclosed code fence");
        break;
      }
      i = end + 3;
      continue;
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        i = end + 1;
        continue;
      }
    }
    if (text.startsWith("$$", i)) {
      if (displayAt >= 0) {
        displayAt = -1;
      } else if (inlineAt >= 0) {
        issues.push(`$ opened at ${where(text, inlineAt)} meets $$`);
        inlineAt = -1;
      } else {
        displayAt = i;
      }
      i += 2;
      continue;
    }
    if (text[i] === "$" && text[i - 1] !== "\\") {
      if (displayAt >= 0) {
        // Lone $ inside $$…$$ — still count; KaTeX display bodies rarely need it.
        i += 1;
        continue;
      }
      if (inlineAt >= 0) {
        inlineAt = -1;
      } else {
        inlineAt = i;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  if (displayAt >= 0) issues.push(`unclosed $$ at ${where(text, displayAt)}`);
  if (inlineAt >= 0) issues.push(`unclosed $ at ${where(text, inlineAt)}`);
  return issues;
}

function where(text: string, index: number): string {
  const line = text.slice(0, index).split("\n").length;
  const col = index - (text.lastIndexOf("\n", index - 1) + 1) + 1;
  return `line ${line} col ${col}`;
}
