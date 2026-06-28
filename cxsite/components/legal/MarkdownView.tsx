/**
 * Self-contained Markdown renderer for legal/policy documents.
 *
 * No third-party deps — we control the subset of Markdown the customer
 * app's policy authors use:
 *   - # ## ### ####            (h1-h4)
 *   - **bold**                  (bold)
 *   - *italic*                  (italic — only when not the bullet marker)
 *   - `inline code`             (inline code)
 *   - [text](url)               (links)
 *   - - bullet / 1. numbered    (lists, single level)
 *   - > blockquote              (blockquote)
 *   - ---                       (horizontal rule)
 *   - tables: pipe-separated    (rendered with header row)
 *   - blank line                (paragraph break)
 *
 * Styling matches the existing cxsite mint→purple→pink palette.
 */
import React from "react";

type Props = {
  source: string;
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function renderInline(raw: string): React.ReactNode[] {
  // Order matters: code first (so its inner text isn't bolded), then links, bold, italic.
  // We tokenize by walking the string and matching patterns.
  const out: React.ReactNode[] = [];
  let i = 0;
  let buf = "";
  let key = 0;

  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };

  while (i < raw.length) {
    // inline code: `...`
    if (raw[i] === "`") {
      const end = raw.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push(
          <code
            key={key++}
            className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.92em] font-mono text-slate-800 border border-slate-200"
          >
            {raw.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    // links: [text](url)
    if (raw[i] === "[") {
      const closeBracket = raw.indexOf("]", i + 1);
      if (closeBracket > i && raw[closeBracket + 1] === "(") {
        const closeParen = raw.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket + 1) {
          const text = raw.slice(i + 1, closeBracket);
          const href = raw.slice(closeBracket + 2, closeParen);
          flush();
          const isExternal = /^https?:\/\//i.test(href);
          out.push(
            <a
              key={key++}
              href={href}
              {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="font-medium text-emerald-700 underline decoration-emerald-300 underline-offset-2 transition-colors hover:text-emerald-900 hover:decoration-emerald-600"
            >
              {text}
            </a>,
          );
          i = closeParen + 1;
          continue;
        }
      }
    }

    // bold: **...**
    if (raw[i] === "*" && raw[i + 1] === "*") {
      const end = raw.indexOf("**", i + 2);
      if (end > i + 1) {
        flush();
        out.push(
          <strong key={key++} className="font-semibold text-slate-900">
            {renderInline(raw.slice(i + 2, end))}
          </strong>,
        );
        i = end + 2;
        continue;
      }
    }

    // italic: *...* (single asterisk, but not when it's a list bullet at line start)
    if (raw[i] === "*" && raw[i + 1] !== " " && raw[i - 1] !== "*") {
      const end = raw.indexOf("*", i + 1);
      if (end > i && raw[end + 1] !== "*") {
        flush();
        out.push(
          <em key={key++} className="italic">
            {renderInline(raw.slice(i + 1, end))}
          </em>,
        );
        i = end + 1;
        continue;
      }
    }

    buf += raw[i];
    i++;
  }
  flush();
  return out;
}

type Block =
  | { kind: "h1" | "h2" | "h3" | "h4"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "table"; header: string[]; rows: string[][] };

function parse(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    if (trimmed.startsWith("#### ")) {
      blocks.push({ kind: "h4", text: trimmed.slice(5) });
      i++;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      blocks.push({ kind: "h3", text: trimmed.slice(4) });
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", text: trimmed.slice(3) });
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ kind: "h1", text: trimmed.slice(2) });
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("> ")) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push({ kind: "quote", text: quoteLines.join(" ") });
      continue;
    }

    // table: | a | b | c |  on next line | --- | --- | --- |
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && i + 1 < lines.length) {
      const sep = lines[i + 1].trim();
      if (/^\|[\s|:-]+\|$/.test(sep)) {
        const header = trimmed.slice(1, -1).split("|").map((c) => c.trim());
        const rows: string[][] = [];
        i += 2;
        while (i < lines.length && lines[i].trim().startsWith("|")) {
          const row = lines[i].trim();
          if (!row.endsWith("|")) break;
          rows.push(row.slice(1, -1).split("|").map((c) => c.trim()));
          i++;
        }
        blocks.push({ kind: "table", header, rows });
        continue;
      }
    }

    // bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // numbered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // paragraph — join consecutive non-empty non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,4}\s/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith("> ") &&
      !lines[i].trim().startsWith("|") &&
      lines[i].trim() !== "---"
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: "p", text: paraLines.join(" ") });
    }
  }

  return blocks;
}

export default function MarkdownView({ source }: Props) {
  const blocks = React.useMemo(() => parse(source), [source]);
  // h2 counter resets for each document. h3 counter resets each time a
  // new h2 is encountered. Both align with TableOfContents extractor in
  // ./legal-meta.ts so anchor links match.
  let h2Index = 0;
  let h3Index = 0;
  return (
    <article className="prose-legal max-w-none print:max-w-none">
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "h1":
            return (
              <h1
                key={idx}
                className="mt-2 mb-6 text-3xl md:text-4xl font-bold tracking-tight text-slate-900"
              >
                {renderInline(b.text)}
              </h1>
            );
          case "h2": {
            h2Index += 1;
            h3Index = 0;
            const id = `s-${h2Index}`;
            return (
              <h2
                key={idx}
                id={id}
                className="group mt-12 mb-4 scroll-mt-24 text-2xl md:text-3xl font-bold text-slate-900 border-b border-slate-200 pb-3 flex items-baseline gap-2"
              >
                <a
                  href={`#${id}`}
                  aria-label="Link to section"
                  className="opacity-0 group-hover:opacity-100 text-emerald-500 text-base no-underline transition-opacity"
                >
                  #
                </a>
                <span>{renderInline(b.text)}</span>
              </h2>
            );
          }
          case "h3": {
            const id = h2Index > 0 ? `s-${h2Index}-${++h3Index}` : undefined;
            return (
              <h3
                key={idx}
                id={id}
                className="mt-8 mb-3 scroll-mt-24 text-xl md:text-2xl font-semibold text-slate-900"
              >
                {renderInline(b.text)}
              </h3>
            );
          }
          case "h4":
            return (
              <h4 key={idx} className="mt-6 mb-2 text-lg font-semibold text-slate-800">
                {renderInline(b.text)}
              </h4>
            );
          case "p":
            return (
              <p key={idx} className="mb-4 leading-7 text-slate-700">
                {renderInline(b.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={idx} className="mb-4 ml-6 list-disc space-y-1.5 text-slate-700 marker:text-emerald-500">
                {b.items.map((it, j) => (
                  <li key={j} className="leading-7">
                    {renderInline(it)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx} className="mb-4 ml-6 list-decimal space-y-1.5 text-slate-700 marker:text-emerald-600 marker:font-semibold">
                {b.items.map((it, j) => (
                  <li key={j} className="leading-7">
                    {renderInline(it)}
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="my-5 border-l-4 border-emerald-400 bg-emerald-50/60 px-4 py-3 italic text-slate-700"
              >
                {renderInline(b.text)}
              </blockquote>
            );
          case "hr":
            return <hr key={idx} className="my-8 border-slate-200" />;
          case "table":
            return (
              <div key={idx} className="my-6 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {b.header.map((h, j) => (
                        <th
                          key={j}
                          className="px-4 py-2.5 text-left font-semibold text-slate-700"
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} className="px-4 py-2.5 text-slate-700 align-top">
                            {renderInline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </article>
  );
}
