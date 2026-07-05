"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import type { MerchantAgreementTemplateDTO } from "@/lib/db/operations/merchant-agreement-templates";
import {
  getDefaultMxContractTemplate,
  parseMxContractTemplate,
  serializeMxContractTemplate,
  type MxContractSection,
  type MxContractTemplateContent,
} from "@/lib/mx-contract-template";

const inputClass =
  "w-full rounded-md border border-gray-200 bg-transparent px-2.5 py-1.5 text-sm text-gray-900 transition-[border-color,box-shadow] placeholder:text-gray-400 hover:border-gray-300 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/30";

const textareaClass = `${inputClass} resize-y min-h-[2.5rem] leading-relaxed text-xs`;

type AgreementForm = {
  id: number | null;
  title: string;
  version: string;
  pdfUrl: string;
  contract: MxContractTemplateContent;
};

function templateToForm(t: MerchantAgreementTemplateDTO | null): AgreementForm {
  const contract = t?.contentMarkdown
    ? parseMxContractTemplate(t.contentMarkdown)
    : getDefaultMxContractTemplate();
  return {
    id: t?.id ?? null,
    title: t?.title ?? "Merchant Partner Agreement",
    version: t?.version ?? "v3",
    pdfUrl: t?.pdfUrl ?? "",
    contract,
  };
}

function getSectionItems(sec: MxContractSection): string[] {
  if (sec.bullets?.length) return [...sec.bullets];
  if (sec.paragraphs?.length) return [...sec.paragraphs];
  return [""];
}

function sectionUsesBullets(sec: MxContractSection): boolean {
  return Boolean(sec.bullets?.length) || !sec.paragraphs?.length;
}

function sectionFromItems(sec: MxContractSection, items: string[]): MxContractSection {
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  const safe = cleaned.length ? cleaned : [""];
  if (sectionUsesBullets(sec)) {
    return { title: sec.title, bullets: safe };
  }
  return { title: sec.title, paragraphs: safe };
}

function splitPartnershipRows(text: string): string[] {
  const blocks = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return blocks.length ? blocks : [""];
}

function joinPartnershipRows(rows: string[]): string {
  return rows.map((r) => r.trim()).filter(Boolean).join("\n\n");
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
  headerRight,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-gray-200">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center justify-between text-left text-xs font-semibold text-gray-800 hover:text-gray-900"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="truncate">{title}</span>
          {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
        </button>
        {headerRight ? <div className="shrink-0">{headerRight}</div> : null}
      </div>
      {open ? <div className="space-y-3 border-t border-gray-100 p-3">{children}</div> : null}
    </div>
  );
}

function AddRowButton({ label, onClick }: { label?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md border border-dashed border-violet-300 px-2.5 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50"
    >
      <Plus className="h-3.5 w-3.5" />
      {label ?? "Add row"}
    </button>
  );
}

function RemoveRowButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Remove row"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function TextRowList({
  rows,
  onChange,
  multiline = true,
  placeholder = "Enter text…",
}: {
  rows: string[];
  onChange: (rows: string[]) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const updateRow = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const addRow = () => onChange([...rows, ""]);

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 shrink-0 text-center text-[10px] font-medium text-gray-400">{i + 1}</span>
          {multiline ? (
            <textarea
              className={`${textareaClass} flex-1`}
              rows={2}
              value={row}
              placeholder={placeholder}
              onChange={(e) => updateRow(i, e.target.value)}
            />
          ) : (
            <input
              className={`${inputClass} flex-1`}
              value={row}
              placeholder={placeholder}
              onChange={(e) => updateRow(i, e.target.value)}
            />
          )}
          <RemoveRowButton onClick={() => removeRow(i)} disabled={rows.length <= 1 && !row.trim()} />
        </div>
      ))}
      <AddRowButton onClick={addRow} />
    </div>
  );
}

export function MxAgreementAdminPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MerchantAgreementTemplateDTO[]>([]);
  const [form, setForm] = useState<AgreementForm>(templateToForm(null));
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/merchant-agreement-templates", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load agreement templates");
      const list = (data.templates ?? []) as MerchantAgreementTemplateDTO[];
      const active = (data.active ?? list.find((t) => t.isActive) ?? list[0] ?? null) as
        | MerchantAgreementTemplateDTO
        | null;
      setTemplates(list);
      const next = templateToForm(active);
      setForm(next);
      setSavedSnapshot(JSON.stringify(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setTemplates([]);
      setForm(templateToForm(null));
      setSavedSnapshot("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isDirty = useMemo(
    () => savedSnapshot !== "" && JSON.stringify(form) !== savedSnapshot,
    [form, savedSnapshot]
  );

  const updateContract = (patch: Partial<MxContractTemplateContent>) => {
    setForm((f) => ({ ...f, contract: { ...f.contract, ...patch } }));
  };

  const updateSection = (index: number, patch: Partial<MxContractSection>) => {
    setForm((f) => {
      const sections = [...f.contract.sections];
      sections[index] = { ...sections[index], ...patch };
      return { ...f, contract: { ...f.contract, sections } };
    });
  };

  const updateSectionItems = (index: number, items: string[]) => {
    setForm((f) => {
      const sections = [...f.contract.sections];
      sections[index] = sectionFromItems(sections[index], items);
      return { ...f, contract: { ...f.contract, sections } };
    });
  };

  const addSection = () => {
    updateContract({
      sections: [
        ...form.contract.sections,
        { title: "New section", bullets: [""] },
      ],
    });
  };

  const removeSection = (index: number) => {
    if (form.contract.sections.length <= 1) return;
    if (!window.confirm(`Remove section "${form.contract.sections[index].title}"?`)) return;
    updateContract({
      sections: form.contract.sections.filter((_, i) => i !== index),
    });
  };

  const addDefinition = () => {
    updateContract({
      definitions: [...form.contract.definitions, { term: "", meaning: "" }],
    });
  };

  const removeDefinition = (index: number) => {
    const next = form.contract.definitions.filter((_, i) => i !== index);
    updateContract({ definitions: next.length ? next : [{ term: "", meaning: "" }] });
  };

  const addAnnexureRow = () => {
    const colCount = form.contract.annexureA.table.headers.length || 3;
    const emptyRow = Array.from({ length: colCount }, () => "");
    updateContract({
      annexureA: {
        ...form.contract.annexureA,
        table: {
          ...form.contract.annexureA.table,
          rows: [...form.contract.annexureA.table.rows, emptyRow],
        },
      },
    });
  };

  const removeAnnexureRow = (ri: number) => {
    const rows = form.contract.annexureA.table.rows.filter((_, i) => i !== ri);
    updateContract({
      annexureA: {
        ...form.contract.annexureA,
        table: {
          ...form.contract.annexureA.table,
          rows: rows.length ? rows : [Array.from({ length: form.contract.annexureA.table.headers.length }, () => "")],
        },
      },
    });
  };

  const addAnnexureColumn = () => {
    const headers = [...form.contract.annexureA.table.headers, `Column ${form.contract.annexureA.table.headers.length + 1}`];
    const rows = form.contract.annexureA.table.rows.map((r) => [...r, ""]);
    updateContract({
      annexureA: {
        ...form.contract.annexureA,
        table: { headers, rows },
      },
    });
  };

  const removeAnnexureColumn = (ci: number) => {
    if (form.contract.annexureA.table.headers.length <= 1) return;
    const headers = form.contract.annexureA.table.headers.filter((_, i) => i !== ci);
    const rows = form.contract.annexureA.table.rows.map((r) => r.filter((_, i) => i !== ci));
    updateContract({
      annexureA: {
        ...form.contract.annexureA,
        table: { headers, rows },
      },
    });
  };

  const save = async (asNewVersion: boolean) => {
    setSaving(true);
    setError(null);
    setInfo(null);
    const contentMarkdown = serializeMxContractTemplate(form.contract);
    try {
      if (asNewVersion || !form.id) {
        const res = await fetch("/api/admin/merchant-agreement-templates", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            version: form.version,
            contentMarkdown,
            pdfUrl: form.pdfUrl.trim() || null,
            isActive: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
        setInfo(`Saved as new version ${form.version}.`);
      } else {
        const res = await fetch(`/api/admin/merchant-agreement-templates/${form.id}`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            version: form.version,
            contentMarkdown,
            pdfUrl: form.pdfUrl.trim() || null,
            isActive: true,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        setInfo("Agreement updated.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const activateTemplate = async (id: number) => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/merchant-agreement-templates/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Activate failed");
      setInfo("Template activated for store onboarding.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activate failed");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!window.confirm("Delete or archive this agreement version?")) return;
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/admin/merchant-agreement-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setInfo("Template removed or archived.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    if (!window.confirm("Reset all contract sections to the default signed template?")) return;
    setForm((f) => ({ ...f, contract: getDefaultMxContractTemplate() }));
  };

  const partnershipRows = useMemo(
    () => splitPartnershipRows(form.contract.partnershipPlanTerms),
    [form.contract.partnershipPlanTerms]
  );

  const certificationRows = useMemo(
    () => splitPartnershipRows(form.contract.certification),
    [form.contract.certification]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-10 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-900">
        <FileText className="mb-1 inline h-4 w-4" /> Edit the <strong>full partner contract</strong>. Use{" "}
        <strong>Add row</strong> / trash icon in each section to add or remove lines. Save when done.
      </div>

      {error ? (
        <div className="flex items-start gap-2 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {info ? <p className="text-xs font-medium text-emerald-700">{info}</p> : null}
      {isDirty ? <p className="text-xs text-amber-700">You have unsaved changes.</p> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-700">Agreement title</label>
          <input
            className={inputClass}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-700">Version</label>
          <input
            className={inputClass}
            value={form.version}
            onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
            placeholder="e.g. v3"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-700">PDF URL (optional)</label>
          <input
            className={inputClass}
            value={form.pdfUrl}
            onChange={(e) => setForm((f) => ({ ...f, pdfUrl: e.target.value }))}
            placeholder="https://…"
          />
        </div>
      </div>

      <CollapsibleSection title="Enrolment form header" defaultOpen>
        <label className="mb-1 block text-[11px] font-medium text-gray-700">Form title</label>
        <textarea
          className={textareaClass}
          rows={2}
          value={form.contract.formTitle}
          onChange={(e) => updateContract({ formTitle: e.target.value })}
        />
      </CollapsibleSection>

      <CollapsibleSection
        title="Definitions"
        defaultOpen
        headerRight={<AddRowButton label="Add definition" onClick={addDefinition} />}
      >
        <div className="space-y-2">
          {form.contract.definitions.map((def, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-center text-[10px] font-medium text-gray-400">{i + 1}</span>
              <input
                className={`${inputClass} sm:w-40`}
                value={def.term}
                placeholder="Term"
                onChange={(e) => {
                  const definitions = [...form.contract.definitions];
                  definitions[i] = { ...definitions[i], term: e.target.value };
                  updateContract({ definitions });
                }}
              />
              <textarea
                className={`${textareaClass} min-w-0 flex-1`}
                rows={2}
                value={def.meaning}
                placeholder="Meaning"
                onChange={(e) => {
                  const definitions = [...form.contract.definitions];
                  definitions[i] = { ...definitions[i], meaning: e.target.value };
                  updateContract({ definitions });
                }}
              />
              <RemoveRowButton onClick={() => removeDefinition(i)} />
            </div>
          ))}
        </div>
      </CollapsibleSection>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-gray-700">Contract sections</p>
        <AddRowButton label="Add section" onClick={addSection} />
      </div>

      {form.contract.sections.map((sec, i) => (
        <CollapsibleSection
          key={`${sec.title}-${i}`}
          title={sec.title || `Section ${i + 1}`}
          defaultOpen={i < 2}
          headerRight={
            form.contract.sections.length > 1 ? (
              <button
                type="button"
                onClick={() => removeSection(i)}
                className="rounded border border-red-200 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
              >
                Remove section
              </button>
            ) : null
          }
        >
          <label className="mb-1 block text-[11px] font-medium text-gray-700">Section title</label>
          <input
            className={`${inputClass} mb-3`}
            value={sec.title}
            onChange={(e) => updateSection(i, { title: e.target.value })}
          />
          <label className="mb-1 block text-[11px] font-medium text-gray-700">Content rows</label>
          <TextRowList
            rows={getSectionItems(sec)}
            onChange={(items) => updateSectionItems(i, items)}
            placeholder="Bullet or paragraph text…"
          />
        </CollapsibleSection>
      ))}

      <CollapsibleSection
        title="Annexure A — Commission table"
        headerRight={
          <div className="flex gap-1">
            <AddRowButton label="Add column" onClick={addAnnexureColumn} />
            <AddRowButton label="Add row" onClick={addAnnexureRow} />
          </div>
        }
      >
        <label className="mb-1 block text-[11px] font-medium text-gray-700">Description</label>
        <textarea
          className={`${textareaClass} mb-3`}
          rows={2}
          value={form.contract.annexureA.description}
          onChange={(e) =>
            updateContract({
              annexureA: { ...form.contract.annexureA, description: e.target.value },
            })
          }
        />

        <label className="mb-1 block text-[11px] font-medium text-gray-700">Table headers</label>
        <div className="mb-3 flex flex-wrap gap-2">
          {form.contract.annexureA.table.headers.map((header, hi) => (
            <div key={hi} className="flex min-w-[140px] flex-1 items-center gap-1">
              <input
                className={inputClass}
                value={header}
                placeholder={`Header ${hi + 1}`}
                onChange={(e) => {
                  const headers = [...form.contract.annexureA.table.headers];
                  headers[hi] = e.target.value;
                  updateContract({
                    annexureA: {
                      ...form.contract.annexureA,
                      table: { ...form.contract.annexureA.table, headers },
                    },
                  });
                }}
              />
              <RemoveRowButton
                onClick={() => removeAnnexureColumn(hi)}
                disabled={form.contract.annexureA.table.headers.length <= 1}
              />
            </div>
          ))}
        </div>

        <label className="mb-1 block text-[11px] font-medium text-gray-700">Table rows</label>
        <div className="space-y-2">
          {form.contract.annexureA.table.rows.map((row, ri) => (
            <div key={ri} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-center text-[10px] font-medium text-gray-400">{ri + 1}</span>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                {row.map((cell, ci) => (
                  <input
                    key={ci}
                    className={inputClass}
                    value={cell}
                    placeholder={form.contract.annexureA.table.headers[ci] || `Col ${ci + 1}`}
                    onChange={(e) => {
                      const rows = form.contract.annexureA.table.rows.map((r) => [...r]);
                      rows[ri][ci] = e.target.value;
                      updateContract({
                        annexureA: {
                          ...form.contract.annexureA,
                          table: { ...form.contract.annexureA.table, rows },
                        },
                      });
                    }}
                  />
                ))}
              </div>
              <RemoveRowButton onClick={() => removeAnnexureRow(ri)} />
            </div>
          ))}
          <AddRowButton onClick={addAnnexureRow} />
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Certification (below Annexure B at onboarding)">
        <TextRowList
          rows={certificationRows}
          onChange={(rows) => updateContract({ certification: joinPartnershipRows(rows) })}
          placeholder="Certification text…"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Partnership Plan — Terms &amp; Conditions (appendix)" defaultOpen>
        <p className="mb-2 text-[10px] text-gray-500">Each row is one paragraph block (blank line between blocks in the contract).</p>
        <TextRowList
          rows={partnershipRows}
          onChange={(rows) => updateContract({ partnershipPlanTerms: joinPartnershipRows(rows) })}
          placeholder="Paragraph / clause text…"
        />
      </CollapsibleSection>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 bg-white py-3">
        <div className="space-y-1">
          <p className="text-[10px] text-gray-500">
            {form.id ? `Editing template #${form.id}` : "No active template — save to create"}
          </p>
          <button
            type="button"
            className="text-[10px] text-violet-700 underline hover:text-violet-900"
            onClick={resetToDefault}
          >
            Reset to default signed contract
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(false)}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save changes
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-violet-300 bg-white px-4 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Save as new version
          </button>
        </div>
      </div>

      {templates.length > 0 ? (
        <div className="rounded-lg border border-gray-200">
          <div className="border-b border-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">All versions</div>
          <ul className="divide-y divide-gray-100">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">
                    {t.title} <span className="text-gray-500">({t.version})</span>
                    {t.isActive ? (
                      <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                        Active
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Updated {new Date(t.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className="rounded border border-gray-200 px-2 py-1 hover:bg-gray-50"
                    onClick={() => {
                      const next = templateToForm(t);
                      setForm(next);
                      setSavedSnapshot(JSON.stringify(next));
                    }}
                  >
                    Edit
                  </button>
                  {!t.isActive ? (
                    <button
                      type="button"
                      className="rounded border border-violet-200 px-2 py-1 text-violet-700 hover:bg-violet-50"
                      onClick={() => void activateTemplate(t.id)}
                      disabled={saving}
                    >
                      Activate
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
                    onClick={() => void deleteTemplate(t.id)}
                    disabled={saving}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
