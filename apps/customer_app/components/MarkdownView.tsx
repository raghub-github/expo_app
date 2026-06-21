/**
 * Self-contained Markdown renderer for the legal pack.
 *
 * Intentionally minimal — supports exactly the subset our policy docs use:
 *   - Headings (#, ##, ###)
 *   - Bold (**text**), italic (*text*), inline code (`code`)
 *   - Bulleted lists (- or *)
 *   - Numbered lists (1.)
 *   - Block quotes (> )
 *   - Links [text](url) — opens in system browser
 *   - Horizontal rules (---)
 *   - Tables (| header | header |)
 *   - Paragraphs separated by blank lines
 *
 * No external dependency. ~250 LOC. Renders fast on a long doc (FAQ ~600 lines).
 */

import { memo, useMemo } from "react";
import { View, Text, StyleSheet, Linking, Pressable, ScrollView } from "react-native";

const TEXT = "#111827";
const MUTED = "#6B7280";
const LINK = "#15803D";
const BORDER = "#E5E7EB";
const CODE_BG = "#F3F4F6";
const QUOTE_BG = "#F9FAFB";

type Block =
  | { type: "h1"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "hr" }
  | { type: "table"; header: string[]; rows: string[][] };

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (buf.length) blocks.push({ type: "p", text: buf.join(" ").trim() });
    buf.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      blocks.push({ type: "h1", text: trimmed.slice(2) });
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3) });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4) });
      i++;
      continue;
    }
    if (trimmed === "---" || trimmed === "***") {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ type: "quote", text: quoteLines.join(" ") });
      continue;
    }
    if (/^([-*])\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^([-*])\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^([-*])\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // Table: header row, separator row, body rows.
      const tableLines: string[] = [trimmed];
      i++;
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const splitRow = (s: string) =>
          s
            .replace(/^\||\|$/g, "")
            .split("|")
            .map((c) => c.trim());
        const header = splitRow(tableLines[0]);
        const rows = tableLines.slice(2).map(splitRow);
        blocks.push({ type: "table", header, rows });
      }
      continue;
    }

    // Paragraph — consume until blank or block boundary.
    const paraBuf: string[] = [trimmed];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (
        !next ||
        next.startsWith("#") ||
        next.startsWith(">") ||
        /^([-*])\s+/.test(next) ||
        /^\d+\.\s+/.test(next) ||
        next.startsWith("|") ||
        next === "---" ||
        next === "***"
      ) {
        break;
      }
      paraBuf.push(next);
      i++;
    }
    flushParagraph(paraBuf);
  }

  return blocks;
}

/** Inline formatting: bold, italic, code, links. Returns React nodes. */
function renderInline(text: string, key: string): React.ReactNode[] {
  // Tokenise on the four patterns; preserve plain text in between.
  const tokens: { kind: "text" | "bold" | "italic" | "code" | "link"; text: string; url?: string }[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ kind: "text", text: text.slice(last, m.index) });
    const t = m[0];
    if (t.startsWith("**")) tokens.push({ kind: "bold", text: t.slice(2, -2) });
    else if (t.startsWith("`")) tokens.push({ kind: "code", text: t.slice(1, -1) });
    else if (t.startsWith("[")) {
      const linkM = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);
      if (linkM) tokens.push({ kind: "link", text: linkM[1], url: linkM[2] });
      else tokens.push({ kind: "text", text: t });
    } else if (t.startsWith("*")) tokens.push({ kind: "italic", text: t.slice(1, -1) });
    last = m.index + t.length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });

  return tokens.map((tok, idx) => {
    if (tok.kind === "bold") {
      return (
        <Text key={`${key}-${idx}`} style={styles.bold}>
          {tok.text}
        </Text>
      );
    }
    if (tok.kind === "italic") {
      return (
        <Text key={`${key}-${idx}`} style={styles.italic}>
          {tok.text}
        </Text>
      );
    }
    if (tok.kind === "code") {
      return (
        <Text key={`${key}-${idx}`} style={styles.codeInline}>
          {tok.text}
        </Text>
      );
    }
    if (tok.kind === "link" && tok.url) {
      const url = tok.url;
      return (
        <Text
          key={`${key}-${idx}`}
          style={styles.link}
          onPress={() => Linking.openURL(url).catch(() => undefined)}
        >
          {tok.text}
        </Text>
      );
    }
    return <Text key={`${key}-${idx}`}>{tok.text}</Text>;
  });
}

type Props = { source: string };

export const MarkdownView = memo(function MarkdownView({ source }: Props) {
  const blocks = useMemo(() => parse(source), [source]);

  return (
    <View style={styles.root}>
      {blocks.map((block, idx) => {
        const key = `b-${idx}`;
        switch (block.type) {
          case "h1":
            return (
              <Text key={key} style={styles.h1}>
                {block.text}
              </Text>
            );
          case "h2":
            return (
              <Text key={key} style={styles.h2}>
                {block.text}
              </Text>
            );
          case "h3":
            return (
              <Text key={key} style={styles.h3}>
                {block.text}
              </Text>
            );
          case "p":
            return (
              <Text key={key} style={styles.p}>
                {renderInline(block.text, key)}
              </Text>
            );
          case "ul":
            return (
              <View key={key} style={styles.list}>
                {block.items.map((item, i) => (
                  <View key={`${key}-i${i}`} style={styles.bulletRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.bulletText}>{renderInline(item, `${key}-i${i}`)}</Text>
                  </View>
                ))}
              </View>
            );
          case "ol":
            return (
              <View key={key} style={styles.list}>
                {block.items.map((item, i) => (
                  <View key={`${key}-i${i}`} style={styles.bulletRow}>
                    <Text style={[styles.bullet, { fontVariant: ["tabular-nums"] }]}>{i + 1}.</Text>
                    <Text style={styles.bulletText}>{renderInline(item, `${key}-i${i}`)}</Text>
                  </View>
                ))}
              </View>
            );
          case "quote":
            return (
              <View key={key} style={styles.quote}>
                <Text style={styles.quoteText}>{renderInline(block.text, key)}</Text>
              </View>
            );
          case "hr":
            return <View key={key} style={styles.hr} />;
          case "table":
            return (
              <ScrollView
                key={key}
                horizontal
                showsHorizontalScrollIndicator
                style={styles.tableWrap}
                contentContainerStyle={{ paddingBottom: 4 }}
              >
                <View style={styles.table}>
                  <View style={[styles.tr, styles.thead]}>
                    {block.header.map((h, i) => (
                      <Text
                        key={`${key}-h${i}`}
                        style={[styles.th, i === block.header.length - 1 && styles.lastCell]}
                      >
                        {renderInline(h, `${key}-h${i}`)}
                      </Text>
                    ))}
                  </View>
                  {block.rows.map((row, ri) => (
                    <View key={`${key}-r${ri}`} style={[styles.tr, ri % 2 === 1 && styles.trAlt]}>
                      {row.map((cell, ci) => (
                        <Text
                          key={`${key}-r${ri}c${ci}`}
                          style={[styles.td, ci === row.length - 1 && styles.lastCell]}
                        >
                          {renderInline(cell, `${key}-r${ri}c${ci}`)}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              </ScrollView>
            );
          default:
            return null;
        }
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { paddingVertical: 8 },
  h1: { fontSize: 24, fontWeight: "700", color: TEXT, marginTop: 16, marginBottom: 12, lineHeight: 30 },
  h2: { fontSize: 19, fontWeight: "700", color: TEXT, marginTop: 20, marginBottom: 10, lineHeight: 24 },
  h3: { fontSize: 16, fontWeight: "600", color: TEXT, marginTop: 14, marginBottom: 8, lineHeight: 22 },
  p: { fontSize: 14.5, color: TEXT, lineHeight: 22, marginBottom: 10 },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  codeInline: {
    fontFamily: "monospace",
    fontSize: 13,
    backgroundColor: CODE_BG,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  link: { color: LINK, textDecorationLine: "underline" },
  list: { marginBottom: 10 },
  bulletRow: { flexDirection: "row", marginBottom: 6, paddingLeft: 4 },
  bullet: { width: 22, color: MUTED, fontSize: 14.5, lineHeight: 22 },
  bulletText: { flex: 1, fontSize: 14.5, color: TEXT, lineHeight: 22 },
  quote: {
    backgroundColor: QUOTE_BG,
    borderLeftWidth: 3,
    borderLeftColor: LINK,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginVertical: 10,
  },
  quoteText: { fontSize: 14, color: MUTED, lineHeight: 21, fontStyle: "italic" },
  hr: { height: 1, backgroundColor: BORDER, marginVertical: 14 },
  tableWrap: { marginVertical: 10 },
  table: { borderWidth: 1, borderColor: BORDER, borderRadius: 6, overflow: "hidden" },
  tr: { flexDirection: "row" },
  trAlt: { backgroundColor: "#FAFAFA" },
  thead: { backgroundColor: "#F3F4F6" },
  th: {
    minWidth: 110,
    padding: 8,
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    borderRightWidth: 1,
    borderRightColor: BORDER,
  },
  td: {
    minWidth: 110,
    padding: 8,
    fontSize: 13,
    color: TEXT,
    borderRightWidth: 1,
    borderRightColor: BORDER,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  lastCell: { borderRightWidth: 0 },
});

export default MarkdownView;
