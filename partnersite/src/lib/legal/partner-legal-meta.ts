export type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

export type LegalMeta = {
  effectiveDate: string | null;
  lastUpdated: string | null;
  version: string | null;
};

export type SplitPartnerLegal = {
  title: string;
  meta: LegalMeta;
  summary: string | null;
  agreementNotice: string | null;
  introHtml: string | null;
  disagreeLine: string | null;
  bodyMarkdown: string;
  toc: TocItem[];
};

const HEADING_LINE = /^(#{2,3})\s+(.+?)\s*$/;

function stripInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

export function extractMeta(source: string): LegalMeta {
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

export function splitPartnerLegalMarkdown(source: string): SplitPartnerLegal {
  const lines = source.split(/\r?\n/);
  const meta = extractMeta(source);

  let title = "Legal Document";
  const titleIdx = lines.findIndex((l) => /^#\s+/.test(l.trim()));
  if (titleIdx >= 0) {
    title = lines[titleIdx].trim().replace(/^#\s+/, "").trim();
  }

  let summary: string | null = null;
  const quoteIdx = lines.findIndex((l) => l.trim().startsWith("> "));
  if (quoteIdx >= 0) {
    const quoteLines: string[] = [];
    for (let i = quoteIdx; i < lines.length && lines[i].trim().startsWith("> "); i++) {
      quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
    }
    summary = quoteLines.join(" ").trim() || null;
  }

  const firstH2Idx = lines.findIndex((l) => /^##\s+/.test(l.trim()));
  const preambleLines =
    firstH2Idx >= 0
      ? lines.slice(titleIdx >= 0 ? titleIdx + 1 : 0, firstH2Idx)
      : lines.slice(titleIdx >= 0 ? titleIdx + 1 : 0);

  const preambleParagraphs = preambleLines
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => {
      if (!p) return false;
      if (/^\*\*Effective Date:\*\*/i.test(p)) return false;
      if (/^\*\*Last Updated:\*\*/i.test(p)) return false;
      if (/^\*\*Version:\*\*/i.test(p)) return false;
      if (p.startsWith(">")) return false;
      return true;
    });

  const disagreeLine =
    preambleParagraphs.find((p) => /^if you do not agree/i.test(stripInline(p))) ?? null;

  const introParagraphs = preambleParagraphs.filter((p) => p !== disagreeLine);
  const agreementNotice = introParagraphs[0] ?? null;
  const introHtml = introParagraphs.length > 1 ? introParagraphs.slice(1).join("\n\n") : null;

  const bodyMarkdown =
    firstH2Idx >= 0 ? lines.slice(firstH2Idx).join("\n") : source;

  return {
    title,
    meta,
    summary,
    agreementNotice,
    introHtml,
    disagreeLine,
    bodyMarkdown,
    toc: extractToc(bodyMarkdown),
  };
}
