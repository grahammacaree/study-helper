import { useEffect, useRef, useState } from "react";

const SYMBOLS: { glyph: string; tex: string; name: string }[] = [
  { glyph: "∈", tex: "\\in", name: "in" },
  { glyph: "∉", tex: "\\notin", name: "not in" },
  { glyph: "⊂", tex: "\\subset", name: "subset" },
  { glyph: "⊆", tex: "\\subseteq", name: "subset or equal" },
  { glyph: "⊊", tex: "\\subsetneq", name: "proper subset" },
  { glyph: "∪", tex: "\\cup", name: "union" },
  { glyph: "∩", tex: "\\cap", name: "intersection" },
  { glyph: "∅", tex: "\\emptyset", name: "empty set" },
  { glyph: "∀", tex: "\\forall", name: "for all" },
  { glyph: "∃", tex: "\\exists", name: "exists" },
  { glyph: "→", tex: "\\to", name: "to" },
  { glyph: "⇒", tex: "\\Rightarrow", name: "implies" },
  { glyph: "≠", tex: "\\neq", name: "not equal" },
  { glyph: "≤", tex: "\\leq", name: "less or equal" },
  { glyph: "≥", tex: "\\geq", name: "greater or equal" },
  { glyph: "≈", tex: "\\approx", name: "approximately" },
  { glyph: "∞", tex: "\\infty", name: "infinity" },
  { glyph: "·", tex: "\\cdot", name: "dot" },
  { glyph: "×", tex: "\\times", name: "times" },
  { glyph: "±", tex: "\\pm", name: "plus minus" },
  { glyph: "Σ", tex: "\\sum", name: "sum" },
  { glyph: "Π", tex: "\\prod", name: "product" },
  { glyph: "√", tex: "\\sqrt{}", name: "square root" },
  { glyph: "α", tex: "\\alpha", name: "alpha" },
  { glyph: "β", tex: "\\beta", name: "beta" },
  { glyph: "ε", tex: "\\varepsilon", name: "epsilon" },
  { glyph: "δ", tex: "\\delta", name: "delta" },
  { glyph: "θ", tex: "\\theta", name: "theta" },
  { glyph: "λ", tex: "\\lambda", name: "lambda" },
  { glyph: "π", tex: "\\pi", name: "pi" },
  { glyph: "σ", tex: "\\sigma", name: "sigma" },
  { glyph: "Ω", tex: "\\Omega", name: "omega" },
  { glyph: "𝔼", tex: "\\mathbb{E}", name: "expectation" },
  { glyph: "ℝ", tex: "\\mathbb{R}", name: "reals" },
  { glyph: "O", tex: "O", name: "big O" },
  { glyph: "Θ", tex: "\\Theta", name: "big theta" },
];

const HINTS: { re: RegExp; tex: string[] }[] = [
  {
    re: /hash|subset|\bsets?\b|union|intersect|combinat|element|belong|subspace|nullspace|column.space|vector.space/,
    tex: [
      "\\in",
      "\\notin",
      "\\subset",
      "\\subseteq",
      "\\subsetneq",
      "\\cup",
      "\\cap",
      "\\emptyset",
    ],
  },
  {
    re: /probab|statist|expect|random|distribut|bayes|varianc|likelihood|stochast/,
    tex: ["\\mathbb{E}", "\\sigma", "\\approx", "\\infty", "\\sum", "\\cdot"],
  },
  {
    re: /t-distribut|student|chi-?squar|\bnorm\b|least.square|quadratic/,
    tex: ["\\sqrt{}", "\\sigma", "\\approx"],
  },
  {
    re: /complexit|runtime|asymptot|big.?o|\bsorting\b|algorithm/,
    tex: ["O", "\\Theta"],
  },
  {
    re: /linear|matrix|matrices|vector|eigen|project|gram|least.square|pseudoinverse/,
    tex: ["\\mathbb{R}", "\\in", "\\to", "\\cdot", "\\times"],
  },
  {
    re: /quantif|forall|exists|\blogic\b|\bproof\b|implies|implication/,
    tex: ["\\forall", "\\exists", "\\Rightarrow", "\\to"],
  },
  {
    re: /series|integr|calculus|\blimits?\b|converg|infin/,
    tex: ["\\sum", "\\prod", "\\infty", "\\approx"],
  },
  {
    re: /inequal|bound|\border\b|compar/,
    tex: ["\\leq", "\\geq", "\\neq", "\\approx"],
  },
];

export function symbolHintFrom(
  session: {
    questTitle?: string;
    conceptId?: string;
    coveredConcepts?: string[];
    inspect: {
      courseTitle: string;
      courseBlurb: string;
      lecture?: { title: string; conceptIds: string[] };
    };
  } | null,
): string {
  if (!session) return "";
  const lec = session.inspect.lecture;
  return [
    session.inspect.courseTitle,
    session.inspect.courseBlurb,
    lec?.title,
    ...(lec?.conceptIds ?? []),
    session.questTitle,
    session.conceptId,
    ...(session.coveredConcepts ?? []),
  ]
    .filter(Boolean)
    .join(" ");
}

export function rankSymbols(
  haystack: string,
  recent: string[] = [],
): typeof SYMBOLS {
  const hay = haystack.toLowerCase();
  const recentAt = new Map(recent.map((tex, i) => [tex, i]));
  const origin = new Map(SYMBOLS.map((s, i) => [s.tex + s.name, i]));
  return SYMBOLS.map((s) => s).sort((a, b) => {
    const ra = recentAt.has(a.tex) ? recentAt.get(a.tex)! : 999;
    const rb = recentAt.has(b.tex) ? recentAt.get(b.tex)! : 999;
    if (ra !== rb) return ra - rb;
    const ka = hintScore(a, hay);
    const kb = hintScore(b, hay);
    if (ka !== kb) return kb - ka;
    return (origin.get(a.tex + a.name) ?? 0) - (origin.get(b.tex + b.name) ?? 0);
  });
}

function hintScore(
  s: (typeof SYMBOLS)[number],
  hay: string,
): number {
  let n = 0;
  for (const group of HINTS) {
    if (group.tex.includes(s.tex) && group.re.test(hay)) n += 1;
  }
  if (s.name.length > 2 && hay.includes(s.name.toLowerCase())) n += 2;
  return n;
}

export function insertTex(
  text: string,
  start: number,
  end: number,
  tex: string,
): { next: string; cursor: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const inMath = (before.split("$").length - 1) % 2 === 1;
  const snippet = inMath ? tex : `$${tex}$`;
  return {
    next: `${before}${snippet}${after}`,
    cursor: start + snippet.length,
  };
}

export function SymbolPicker({
  disabled,
  hint = "",
  recent = [],
  onPick,
}: {
  disabled?: boolean;
  hint?: string;
  recent?: string[];
  onPick: (tex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const shown = rankSymbols(hint, recent);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="symbol-picker" ref={root}>
      <button
        type="button"
        className="secondary"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="symbol-picker-panel"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        Symbols
      </button>
      {open && (
        <div
          id="symbol-picker-panel"
          className="symbol-panel"
          role="dialog"
          aria-label="Math symbols"
          onMouseDown={(e) => e.preventDefault()}
        >
          {shown.map((s) => (
            <button
              key={s.tex + s.name}
              type="button"
              className="symbol-item"
              title={s.name}
              aria-label={s.name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPick(s.tex);
                setOpen(false);
              }}
            >
              {s.glyph}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
