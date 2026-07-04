"use client";

import React from "react";
import { resolvePartnerLegalHref } from "@/lib/legal/registry";

type Props = {
  source: string;
  variant?: "document" | "inline";
};

function renderInline(raw: string): React.ReactNode[] {
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

    if (raw[i] === "[") {
      const closeBracket = raw.indexOf("]", i + 1);
      if (closeBracket > i && raw[closeBracket + 1] === "(") {
        const closeParen = raw.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket + 1) {
          const text = raw.slice(i + 1, closeBracket);
          const rawHref = raw.slice(closeBracket + 2, closeParen);
          const href = resolvePartnerLegalHref(rawHref);
          flush();
          const isExternal = /^https?:\/\//i.test(href) || href.startsWith("mailto:");
          out.push(
            <a
              key={key++}
              href={href}
              {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-2 transition-colors hover:text-emerald-900 hover:decoration-emerald-500"
            >
              {text}
            </a>,
          );
          i = closeParen + 1;
          continue;
        }
      }
    }

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

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

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

function parseSectionHeading(text: string): { number: string | null; label: string } {
  const m = text.match(/^(\d+)\.\s*(.+)$/);
  if (m) return { number: m[1], label: m[2] };
  return { number: null, label: text };
}

export default function PartnerMarkdownView({ source, variant = "document" }: Props) {
  const blocks = React.useMemo(() => parse(source), [source]);
  let h2Index = 0;
  let h3Index = 0;
  const isInline = variant === "inline";

  return (
    <article className={isInline ? "inline-legal" : "prose-legal max-w-none"}>
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "h1":
            if (isInline) return null;
            return (
              <h1 key={idx} className="sr-only">
                {renderInline(b.text)}
              </h1>
            );
          case "h2": {
            h2Index += 1;
            h3Index = 0;
            const id = `s-${h2Index}`;
            const { number, label } = parseSectionHeading(b.text);
            return (
              <h2
                key={idx}
                id={id}
                className="mb-5 mt-10 scroll-mt-28 flex items-start gap-3 first:mt-0"
              >
                <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-emerald-600 px-2 text-sm font-bold text-white shadow-sm">
                  {number ?? h2Index}
                </span>
                <span className="pt-0.5 text-lg font-bold leading-snug text-slate-900 sm:text-xl">
                  {renderInline(label)}
                </span>
              </h2>
            );
          }
          case "h3": {
            const id = h2Index > 0 ? `s-${h2Index}-${++h3Index}` : undefined;
            return (
              <h3
                key={idx}
                id={id}
                className="mb-3 mt-7 scroll-mt-28 text-base font-semibold text-slate-900 sm:text-lg"
              >
                {renderInline(b.text)}
              </h3>
            );
          }
          case "h4":
            return (
              <h4 key={idx} className="mb-2 mt-5 text-base font-semibold text-slate-800">
                {renderInline(b.text)}
              </h4>
            );
          case "p":
            return (
              <p
                key={idx}
                className={
                  isInline
                    ? "inline leading-relaxed"
                    : "mb-4 text-sm leading-7 text-slate-700 sm:text-[15px]"
                }
              >
                {renderInline(b.text)}
              </p>
            );
          case "ul":
            return (
              <ul
                key={idx}
                className="mb-5 ml-1 space-y-2.5 text-sm text-slate-700 sm:text-[15px] marker:text-emerald-600"
              >
                {b.items.map((it, j) => (
                  <li key={j} className="flex gap-2.5 leading-7">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    <span>{renderInline(it)}</span>
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={idx}
                className="mb-5 ml-5 list-decimal space-y-2 text-sm text-slate-700 marker:font-semibold marker:text-emerald-700 sm:text-[15px]"
              >
                {b.items.map((it, j) => (
                  <li key={j} className="leading-7 pl-1">
                    {renderInline(it)}
                  </li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="my-5 border-l-4 border-emerald-400 bg-emerald-50/60 px-4 py-3 text-sm italic text-slate-700"
              >
                {renderInline(b.text)}
              </blockquote>
            );
          case "hr":
            return <hr key={idx} className="my-8 border-slate-200" />;
          case "table":
            return (
              <div key={idx} className="my-6 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      {b.header.map((h, j) => (
                        <th
                          key={j}
                          className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
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
                          <td key={k} className="px-4 py-3 align-top text-slate-700">
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
