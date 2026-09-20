/** Adjacent gather/align environments in one $$ render as one wide row in KaTeX. */
const MATH_ENV =
  /\\begin\{(gathered|gather|aligned|align\*?)\}([\s\S]*?)\\end\{\1\}/g;

function splitEnvRows(name: string, body: string): string[] {
  const rows = body
    .split(/\\\\/)
    .map((row) => row.replace(/^\s*&/, "").trim())
    .filter(Boolean);
  if (rows.length <= 1) {
    return [`\\begin{${name}}${body}\\end{${name}}`];
  }
  return rows.map((row) => `\\begin{gathered}\n${row}\n\\end{gathered}`);
}

export function splitMathEnvs(tex: string): string[] {
  const t = tex.replace(/^\$+|\$+$/g, "").trim();
  if (!t) return [];
  const parts = [...t.matchAll(MATH_ENV)].flatMap((m) =>
    splitEnvRows(m[1], m[2]),
  );
  if (parts.length > 1) return parts;
  if (parts.length === 1) return parts;
  return [t];
}
