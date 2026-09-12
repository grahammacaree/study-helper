/** Pane label: "Side Quest: Universal Hashing". */
export function questPaneTitle(title: string): string {
  const name = title.trim();
  if (!name) return "Side Quest";
  return `Side Quest: ${titleCase(name)}`;
}

export function titleCase(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) =>
      /^\s+$/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join("");
}

export function isQuestDisclaimer(text: string): boolean {
  return /does not skip the lecture map/i.test(text);
}

export function stripQuestChrome(text: string, title: string): string {
  const want = title.trim().toLowerCase();
  const lines = text.trim().split("\n");
  while (lines.length) {
    const raw = lines[0].trim();
    if (!raw) {
      lines.shift();
      continue;
    }
    const plain = raw
      .replace(/^#{1,4}\s+/, "")
      .replace(/\*\*/g, "")
      .trim()
      .toLowerCase();
    if (isQuestDisclaimer(raw)) {
      lines.shift();
      continue;
    }
    if (plain === want) {
      lines.shift();
      continue;
    }
    if (
      /side quest/.test(plain) &&
      (plain.includes(want) || /^.+\s+[—–-]\s+side quest$/.test(plain))
    ) {
      lines.shift();
      continue;
    }
    break;
  }
  return lines.join("\n").trim();
}
