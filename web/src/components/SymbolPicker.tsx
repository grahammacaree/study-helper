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
  onPick,
}: {
  disabled?: boolean;
  onPick: (tex: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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
        >
          {SYMBOLS.map((s) => (
            <button
              key={s.tex + s.name}
              type="button"
              className="symbol-item"
              title={s.name}
              aria-label={s.name}
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
