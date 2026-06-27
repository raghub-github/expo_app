/**
 * Pure helpers used by LegalPage + MarkdownView. Kept in one place so the
 * sidebar TOC, the hero badges and the printed body all derive from the
 * same source — the markdown itself — rather than re-encoding metadata
 * in the registry.
 *
 * Slug rules match what MarkdownView's `h2` renderer emits today
 * (`s-1`, `s-2`, …) so the TOC links resolve.
 */

export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

const HEADING_LINE = /^(#{2,3})\s+(.+?)\s*$/;

/**
 * Extract h2 + h3 from the raw markdown, in document order. h3 headings
 * are nested under the most recent h2 visually but flat in the array —
 * the caller renders the indent.
 *
 * IDs match MarkdownView's render output. h2 → `s-1, s-2, …`; h3 → the
 * parent h2's id with a sub-counter, e.g. `s-2-1`.
 */
export function extractToc(source: string): TocItem[] {
  const lines = source.split(/\r?\n/);
  const out: TocItem[] = [];
  let h2Count = 0;
  let h3Count = 0;
  let inCodeBlock = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;
    const m = HEADING_LINE.exec(line);
    if (!m) continue;
    const level = m[1].length as 2 | 3;
    const text = stripInline(m[2]);
    if (!text) continue;
    if (level === 2) {
      h2Count += 1;
      h3Count = 0;
      out.push({ id: `s-${h2Count}`, text, level: 2 });
    } else if (level === 3 && h2Count > 0) {
      h3Count += 1;
      out.push({ id: `s-${h2Count}-${h3Count}`, text, level: 3 });
    }
  }
  return out;
}

/**
 * Strip markdown inline syntax (bold, italic, code, links) so a TOC entry
 * shows plain text. Cheap, not exhaustive — good enough for legal docs.
 */
function stripInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

/**
 * Pull `Effective Date:` / `Last Updated:` / `Version:` from the top of
 * the markdown. These are conventionally on lines 3–6 in every legal
 * file. Returns null fields when not present; the UI just hides them.
 */
export type LegalMeta = {
  effectiveDate: string | null;
  lastUpdated: string | null;
  version: string | null;
};

export function extractMeta(source: string): LegalMeta {
  // Look at the first ~30 lines; everything after that is body.
  const head = source.split(/\r?\n/, 30).join("\n");
  const grab = (label: string): string | null => {
    const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n]+)`, "i");
    const m = re.exec(head);
    return m ? m[1].trim() : null;
  };
  return {
    effectiveDate: grab("Effective Date"),
    lastUpdated: grab("Last Updated"),
    version: grab("Version"),
  };
}

/**
 * Estimate reading time in minutes at 230 wpm (average for legal text,
 * which is denser than narrative). Always ≥ 1.
 */
export function estimateReadingMinutes(source: string): number {
  const words = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/\|/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}
