"use client";

import useSWR from "swr";
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, X } from "lucide-react";
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
  low: "bg-slate-100 text-slate-700",
  normal: "bg-teal-100 text-teal-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-rose-100 text-rose-700",
};

const ROLE_COLORS: Record<string, string> = {
  customer: "bg-indigo-100 text-indigo-700",
  merchant: "bg-emerald-100 text-emerald-700",
  rider: "bg-amber-100 text-amber-700",
  admin: "bg-slate-200 text-slate-800",
  all: "bg-purple-100 text-purple-700",
};

export default function TemplatesPage() {
  const [category, setCategory] = useState<string | "">("");
  const [role, setRole] = useState<string | "">("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);
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
    <div className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
          <h1 className="text-2xl font-semibold text-slate-900">Templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Edit title, body, image and deep link for every automatic event. Uses {"{{variable}}"} substitution.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" />
          New template
        </button>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="w-72 rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-2 text-sm outline-none focus:border-teal-600"
            placeholder="Search code / title / body"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {CATEGORY_TAGS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          <option value="">All roles</option>
          {ROLE_TAGS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2">Priority</th>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={7}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-6 text-center text-slate-500" colSpan={7}>No templates match.</td></tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2 font-mono text-xs text-slate-800">{t.code}</td>
                  <td className="px-4 py-2 text-slate-600">{t.category}</td>
                  <td className="px-4 py-2">
                    <span className={"rounded-md px-1.5 py-0.5 text-[11px] " + (ROLE_COLORS[t.role] ?? "bg-slate-100 text-slate-700")}>
                      {t.role}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={"rounded-md px-1.5 py-0.5 text-[11px] " + (PRIORITY_COLORS[t.priority] ?? "bg-slate-100")}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-2 max-w-[380px] truncate text-slate-700">{t.title_template}</td>
                  <td className="px-4 py-2">
                    {t.enabled ? (
                      <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-700">Enabled</span>
                    ) : (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">Disabled</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setEditing(t)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Test any template on the <Link href="/dashboard/super-admin/notifications/campaigns" className="text-teal-700 underline">Campaigns</Link> page — you can preview and send to yourself before broadcasting.
      </p>

      {editing ? <EditTemplate template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); mutate(); }} /> : null}
      {creating ? <CreateTemplate onClose={() => setCreating(false)} onSaved={() => { setCreating(false); mutate(); }} /> : null}
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      {children}
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </label>
  );
}

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

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`/api/super-admin/notifications/templates/${template.id}`, {
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
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">Editing</div>
            <div className="font-mono text-sm text-slate-900">{template.code}</div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Title template" hint={`Vars: ${Object.keys(template.variables_schema).join(", ") || "(none)"}`}>
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Body template">
            <textarea rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="Image URL (optional)">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Deep link (optional)" hint="Supports {{variable}} substitution.">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={deepLink} onChange={(e) => setDeepLink(e.target.value)} placeholder="/orders/{{orderId}}" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Priority">
              <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITY_TAGS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Enabled">
              <div className="mt-1 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span>{enabled ? "Live" : "Disabled"}</span>
              </div>
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
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

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/super-admin/notifications/templates", {
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
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-900/40">
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="text-sm font-semibold text-slate-900">New template</div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-5">
          <Field label="Code (unique)" hint="ALL_CAPS_UNDERSCORE. E.g. FESTIVE_DIWALI_OFFER">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono" value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Category">
              <select className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORY_TAGS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Role">
              <select className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLE_TAGS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </Field>
            <Field label="Channel">
              <select className="w-full rounded-md border border-slate-200 px-2 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {["push", "in_app", "browser", "all"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Title template">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Body template">
            <textarea rows={4} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="Deep link (optional)">
            <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={deepLink} onChange={(e) => setDeepLink(e.target.value)} />
          </Field>
          <Field label="Priority">
            <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_TAGS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <button onClick={onClose} className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={save} disabled={saving || !code.trim() || !title || !body} className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
