"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Send, X, Bell, CheckCircle2, AlertCircle, Eye } from "lucide-react";
import Link from "next/link";

type Template = {
  id: number;
  code: string;
  category: string;
  role: string;
  channel: string;
  title_template: string;
  body_template: string;
  image_url: string | null;
  deep_link: string | null;
  priority: string;
  locale: string;
  version: number;
  enabled: boolean;
  variables_schema: Record<string, string>;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CATEGORY_TAGS = [
  "order",
  "payment",
  "kyc",
  "wallet",
  "marketing",
  "system",
  "account",
  "operational",
  "announcement",
  "emergency",
];

const ROLE_TAGS = ["customer", "merchant", "rider", "admin", "all"];
const PRIORITY_TAGS = ["low", "normal", "high", "critical"];

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  normal: "bg-teal-50 text-teal-700 border-teal-200",
  high: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

const ROLE_COLORS: Record<string, string> = {
  customer: "bg-indigo-50 text-indigo-700 border-indigo-200",
  merchant: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rider: "bg-amber-50 text-amber-700 border-amber-200",
  admin: "bg-slate-100 text-slate-700 border-slate-200",
  all: "bg-purple-50 text-purple-700 border-purple-200",
};

function extractVariables(...tpls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  for (const t of tpls) {
    if (!t) continue;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) != null) {
      const k = m[1];
      if (k && !seen.has(k)) {
        seen.add(k);
        out.push(k);
      }
    }
  }
  return out;
}

function inputKindFor(name: string): "text" | "number" | "textarea" {
  const n = name.toLowerCase();
  if (/(count|number|amount|total|qty|quantity|price|rupees|order_id)$/.test(n)) return "number";
  if (/(body|message|description|reason|note)$/.test(n)) return "textarea";
  return "text";
}

export default function TemplatesPage() {
  const [category, setCategory] = useState<string | "">("");
  const [role, setRole] = useState<string | "">("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
  const [testing, setTesting] = useState<Template | null>(null);
  const [creating, setCreating] = useState(false);

  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (role) qs.set("role", role);

  const { data, mutate, isLoading } = useSWR<{ items: Template[] }>(
    "/api/super-admin/notifications/templates?" + qs.toString(),
    fetcher,
  );

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.title_template.toLowerCase().includes(q) ||
        t.body_template.toLowerCase().includes(q),
    );
  }, [data, query]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
              <Bell className="h-3 w-3" /> Notifications
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Templates</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Every automatic event uses one of these templates. Click a row to see the full
              text, hit <b>Test</b> to send it to yourself or any user_id, and use <b>Edit</b>
              to change the wording, image or deep link — no code deploy required. Uses{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">&#123;&#123;variable&#125;&#125;</code>{" "}
              substitution.
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" /> New template
          </button>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
            <input
              className="w-72 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              placeholder="Search code / title / body"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {CATEGORY_TAGS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="">All roles</option>
            {ROLE_TAGS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="ml-auto text-xs text-slate-500">
            {filtered.length} template{filtered.length === 1 ? "" : "s"}
          </div>
        </div>

        {/* Table — horizontal slide (touch / trackpad / scrollbar) */}
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div
            className="overflow-x-auto overscroll-x-contain scroll-smooth [-webkit-overflow-scrolling:touch] [scrollbar-gutter:stable]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <table className="w-full min-w-[960px] border-separate border-spacing-0 divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky left-0 z-20 bg-slate-50 px-4 py-3 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.08)]">
                    Code
                  </th>
                  <th className="px-4 py-3 whitespace-nowrap">Category</th>
                  <th className="px-4 py-3 whitespace-nowrap">Role</th>
                  <th className="px-4 py-3 whitespace-nowrap">Priority</th>
                  <th className="px-4 py-3 whitespace-nowrap min-w-[280px]">Title</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="sticky right-0 z-20 bg-slate-50 px-4 py-3 text-right shadow-[-2px_0_6px_-2px_rgba(15,23,42,0.08)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No templates match.
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setEditing(t)}
                      className="group cursor-pointer transition hover:bg-teal-50/40"
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-3 font-mono text-xs text-slate-800 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)] group-hover:bg-teal-50/40">
                        {t.code}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{t.category}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={
                            "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium " +
                            (ROLE_COLORS[t.role] ?? "bg-slate-100 text-slate-700 border-slate-200")
                          }
                        >
                          {t.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={
                            "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium " +
                            (PRIORITY_COLORS[t.priority] ??
                              "bg-slate-100 text-slate-700 border-slate-200")
                          }
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[420px] truncate text-slate-700">
                        {t.title_template}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {t.enabled ? (
                          <span className="inline-flex rounded-md border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td
                        className="sticky right-0 z-10 bg-white px-4 py-3 text-right shadow-[-2px_0_6px_-2px_rgba(15,23,42,0.06)] group-hover:bg-teal-50/40"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setTesting(t)}
                            disabled={!t.enabled}
                            title={
                              t.enabled
                                ? "Send a test notification"
                                : "Enable this template first"
                            }
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" /> Test
                          </button>
                          <button
                            onClick={() => setEditing(t)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Want to broadcast to a whole role bucket? Go to{" "}
          <Link href="/dashboard/super-admin/notifications/campaigns" className="text-teal-700 underline">
            Campaigns
          </Link>{" "}
          — pick a template, fill variables, and send.
        </p>
      </div>

      {editing ? <EditTemplate template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); mutate(); }} /> : null}
      {testing ? <TestSend template={testing} onClose={() => setTesting(null)} /> : null}
      {creating ? <CreateTemplate onClose={() => setCreating(false)} onSaved={() => { setCreating(false); mutate(); }} /> : null}
    </div>
  );
}

function Field({ label, children, hint, mono }: { label: string; children: React.ReactNode; hint?: string; mono?: boolean }) {
  return (
    <label className="block">
      <div className={"mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 " + (mono ? "font-mono normal-case" : "")}>
        {label}
      </div>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </label>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <div className="text-[13px] font-semibold text-slate-900">{title}</div>
        {desc ? <div className="text-[11px] text-slate-500">{desc}</div> : null}
      </div>
      {children}
    </section>
  );
}

/* ============================================================================
 *  Test send — pick a target and fill variables
 * ==========================================================================*/

function TestSend({ template, onClose }: { template: Template; onClose: () => void }) {
  const [targetMode, setTargetMode] = useState<"self" | "user_id" | "topic">("self");
  const [userId, setUserId] = useState("");
  const [topic, setTopic] = useState("");
  const templateVars = useMemo(
    () => extractVariables(template.title_template, template.body_template),
    [template],
  );
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ title: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const varsPayload = useMemo(() => {
    const out: Record<string, string | number> = {};
    for (const k of templateVars) {
      const v = varValues[k] ?? "";
      const kind = inputKindFor(k);
      if (kind === "number" && v !== "" && !Number.isNaN(Number(v))) out[k] = Number(v);
      else if (v !== "") out[k] = v;
    }
    return out;
  }, [templateVars, varValues]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/super-admin/notifications/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateCode: template.code, variables: varsPayload }),
        });
        if (!res.ok) return;
        const j = await res.json();
        setPreview({ title: j.rendered.title, body: j.rendered.body });
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.code, JSON.stringify(varsPayload)]);

  const send = async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      let target: Record<string, unknown>;
      if (targetMode === "self") {
        // Send as a one-off role-based campaign to admin — same secret pathway
        target = { role: "admin" };
      } else if (targetMode === "user_id") {
        if (!userId.trim()) throw new Error("user_id required");
        target = { user_id: userId.trim() };
      } else {
        if (!topic.trim()) throw new Error("topic required");
        target = { topic: topic.trim() };
      }
      const res = await fetch("/api/super-admin/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateCode: template.code,
          variables: varsPayload,
          target,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = await res.json();
      setSuccess(`Queued ${j.queued ?? 0} recipient(s).`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Test send</div>
            <div className="font-mono text-sm text-slate-900">{template.code}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <Section title="Send to" desc="Only one recipient — this is for testing.">
            <div className="grid grid-cols-3 gap-2">
              {(["self", "user_id", "topic"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setTargetMode(m)}
                  className={
                    "rounded-md border px-3 py-2 text-xs font-medium transition " +
                    (targetMode === m
                      ? "border-teal-600 bg-teal-50 text-teal-700 ring-1 ring-teal-600"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50")
                  }
                >
                  {m === "self" ? "Myself (admin role)" : m}
                </button>
              ))}
            </div>
            <div className="mt-3">
              {targetMode === "user_id" && (
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  placeholder="e.g. GMC-1 · GMM-…"
                />
              )}
              {targetMode === "topic" && (
                <input
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. promo_kolkata"
                />
              )}
              {targetMode === "self" && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  This will fan out to every user with role = admin who has a registered device token.
                </div>
              )}
            </div>
          </Section>

          {templateVars.length > 0 ? (
            <Section title={`Variables (${templateVars.length})`} desc="Fill the placeholders so the message renders correctly.">
              <div className="grid grid-cols-1 gap-3">
                {templateVars.map((v) => {
                  const kind = inputKindFor(v);
                  return (
                    <Field key={v} label={v} mono>
                      {kind === "textarea" ? (
                        <textarea
                          rows={3}
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                          value={varValues[v] ?? ""}
                          onChange={(e) => setVarValues((p) => ({ ...p, [v]: e.target.value }))}
                          placeholder={`Enter ${v}`}
                        />
                      ) : (
                        <input
                          type={kind === "number" ? "number" : "text"}
                          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                          value={varValues[v] ?? ""}
                          onChange={(e) => setVarValues((p) => ({ ...p, [v]: e.target.value }))}
                          placeholder={`Enter ${v}`}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </Section>
          ) : null}

          <Section title="Preview">
            {preview ? (
              <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-3">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-4 w-4 text-teal-700" />
                  <div className="min-w-0">
                    <div className="font-semibold text-teal-900">{preview.title}</div>
                    <div className="mt-0.5 text-sm text-teal-900/80">{preview.body}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <Eye className="mr-1 -mt-0.5 inline h-3.5 w-3.5" />
                Fill some variables to see the rendered notification.
              </div>
            )}
          </Section>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <div>{error}</div>
            </div>
          ) : null}
          {success ? (
            <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <div>{success}</div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Close</button>
          <button
            onClick={send}
            disabled={busy || (targetMode === "user_id" && !userId.trim()) || (targetMode === "topic" && !topic.trim())}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Send test
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
 *  Edit + Create (unchanged from previous version, just tidied)
 * ==========================================================================*/

function EditTemplate({
  template,
  onClose,
  onSaved,
}: {
  template: Template;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(template.title_template);
  const [body, setBody] = useState(template.body_template);
  const [image, setImage] = useState(template.image_url ?? "");
  const [deepLink, setDeepLink] = useState(template.deep_link ?? "");
  const [priority, setPriority] = useState(template.priority);
  const [enabled, setEnabled] = useState(template.enabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/super-admin/notifications/templates/${template.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title_template: title,
          body_template: body,
          image_url: image || null,
          deep_link: deepLink || null,
          priority,
          enabled,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const templateVars = useMemo(
    () => extractVariables(title, body),
    [title, body],
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Edit template</div>
            <div className="font-mono text-sm text-slate-900">{template.code}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {template.role} · {template.category} · v{template.version}
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <Field label="Title template" hint={`Detected variables: ${templateVars.join(", ") || "(none)"}`}>
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Body template">
            <textarea rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="Image URL (optional)">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Deep link (optional)" hint="Supports {{variable}} substitution.">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="/orders/{{orderId}}" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_TAGS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Enabled">
              <div className="mt-1 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="text-slate-700">{enabled ? "Live" : "Disabled"}</span>
              </div>
            </Field>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4" /> <div>{error}</div>
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateTemplate({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState("");
  const [category, setCategory] = useState("marketing");
  const [role, setRole] = useState("customer");
  const [channel, setChannel] = useState("push");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [priority, setPriority] = useState("normal");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/notifications/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          category,
          role,
          channel,
          title_template: title,
          body_template: body,
          deep_link: deepLink || null,
          priority,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-slate-900/40 backdrop-blur-sm">
      <div className="ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
            <div className="text-base font-semibold text-slate-900">New template</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <Field label="Code (unique)" hint="ALL_CAPS_UNDERSCORE. e.g. FESTIVE_DIWALI_OFFER">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Category">
              <select className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm outline-none focus:border-teal-600" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_TAGS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Role">
              <select className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm outline-none focus:border-teal-600" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_TAGS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Channel">
              <select className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm outline-none focus:border-teal-600" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {["push", "in_app", "browser", "all"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Title template">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Body template">
            <textarea rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="Deep link (optional)">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600" value={deepLink} onChange={(e) => setDeepLink(e.target.value)} />
          </Field>
          <Field label="Priority">
            <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_TAGS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4" /> <div>{error}</div>
            </div>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving || !code.trim() || !title || !body} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
