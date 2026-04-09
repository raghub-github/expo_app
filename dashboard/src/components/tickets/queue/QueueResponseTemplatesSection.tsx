"use client";

import { useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import {
  useTicketResponseTemplateCreate,
  useTicketResponseTemplateDelete,
  useTicketResponseTemplatesQuery,
  useTicketResponseTemplateUpdate,
  type TicketResponseTemplate,
  type TicketResponseTemplateType,
} from "@/hooks/tickets/useTicketResponseTemplatesQuery";

type TemplateDraft = {
  id: number;
  templateType: TicketResponseTemplateType;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
};

export function QueueResponseTemplatesSection() {
  const { toast } = useToast();
  const { data, isLoading, isError, error } = useTicketResponseTemplatesQuery();
  const createMutation = useTicketResponseTemplateCreate();
  const updateMutation = useTicketResponseTemplateUpdate();
  const deleteMutation = useTicketResponseTemplateDelete();
  const [activeType, setActiveType] = useState<TicketResponseTemplateType>("quick_reply");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [dirtyMap, setDirtyMap] = useState<Record<number, TemplateDraft>>({});

  const canManage = data?.canManage === true;
  const templates = data?.templates ?? [];

  const filtered = useMemo(
    () => templates.filter((t) => t.templateType === activeType).sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [templates, activeType]
  );
  const quickReplyCount = templates.filter((t) => t.templateType === "quick_reply").length;
  const knowledgeBaseCount = templates.filter((t) => t.templateType === "knowledge_base").length;

  const getDraft = (t: TicketResponseTemplate): TemplateDraft =>
    dirtyMap[t.id] ?? {
      id: t.id,
      templateType: t.templateType,
      title: t.title,
      content: t.content,
      sortOrder: t.sortOrder,
      isActive: t.isActive,
    };

  const setDraft = (id: number, patch: Partial<TemplateDraft>) => {
    const source = templates.find((t) => t.id === id);
    if (!source) return;
    const current = getDraft(source);
    setDirtyMap((prev) => ({ ...prev, [id]: { ...current, ...patch } }));
  };

  const saveTemplate = (id: number) => {
    const source = templates.find((t) => t.id === id);
    if (!source) return;
    const draft = getDraft(source);
    if (!draft.content.trim()) {
      toast("Template content cannot be empty", "error");
      return;
    }
    updateMutation.mutate(
      {
        id,
        templateType: draft.templateType,
        title: draft.title,
        content: draft.content,
        sortOrder: draft.sortOrder,
        isActive: draft.isActive,
      },
      {
        onSuccess: () => {
          setDirtyMap((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
          });
          toast("Template updated");
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Update failed", "error"),
      }
    );
  };

  const createTemplate = () => {
    const content = newContent.trim();
    if (!content) {
      toast("Template content is required", "error");
      return;
    }
    const nextSortOrder =
      filtered.length > 0 ? Math.max(...filtered.map((t) => Number(t.sortOrder) || 0)) + 10 : 10;
    createMutation.mutate(
      {
        templateType: activeType,
        title: newTitle.trim(),
        content,
        sortOrder: nextSortOrder,
      },
      {
        onSuccess: () => {
          setNewTitle("");
          setNewContent("");
          toast("Template added");
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Create failed", "error"),
      }
    );
  };

  return (
    <section className="mx-auto w-full max-w-6xl bg-white px-2 pb-8 sm:px-4">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-gray-200 pb-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">Response library</h3>
          <p className="mt-1 text-sm text-gray-600">
            Manage quick replies and knowledge base snippets shown in the conversation composer.
          </p>
        </div>
        <div className="inline-flex shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1">
          <button
            type="button"
            onClick={() => setActiveType("quick_reply")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              activeType === "quick_reply" ? "bg-white text-blue-700 shadow-sm" : "text-gray-700 hover:text-gray-900"
            }`}
          >
            Quick reply ({quickReplyCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveType("knowledge_base")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              activeType === "knowledge_base" ? "bg-white text-blue-700 shadow-sm" : "text-gray-700 hover:text-gray-900"
            }`}
          >
            Knowledge base ({knowledgeBaseCount})
          </button>
        </div>
      </div>
      {!canManage ? <p className="mb-3 text-xs font-medium text-amber-700">Read-only</p> : null}

      {isLoading ? <p className="text-sm text-gray-500">Loading templates…</p> : null}
      {isError ? (
        <p className="text-sm text-red-700">{error instanceof Error ? error.message : "Failed to load templates."}</p>
      ) : null}

      {!isLoading && !isError ? (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <div className="hidden border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 xl:grid xl:grid-cols-[220px_minmax(420px,1fr)_90px_92px_170px]">
            <span>Title</span>
            <span>Content</span>
            <span>Sort</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {filtered.map((t) => {
            const d = getDraft(t);
            const isDirty =
              d.title !== t.title ||
              d.content !== t.content ||
              d.sortOrder !== t.sortOrder ||
              d.isActive !== t.isActive ||
              d.templateType !== t.templateType;
            return (
              <div key={t.id} className="border-b border-gray-200 bg-white p-3 last:border-b-0">
                <div className="grid grid-cols-1 gap-2 xl:grid-cols-[220px_minmax(420px,1fr)_90px_92px_170px] xl:items-center">
                  <input
                    type="text"
                    value={d.title}
                    onChange={(e) => setDraft(t.id, { title: e.target.value })}
                    disabled={!canManage}
                    placeholder="Optional title"
                    className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                  <input
                    type="text"
                    value={d.content}
                    onChange={(e) => setDraft(t.id, { content: e.target.value })}
                    disabled={!canManage}
                    placeholder="Template content"
                    className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                  <input
                    type="number"
                    min={0}
                    value={d.sortOrder}
                    onChange={(e) => setDraft(t.id, { sortOrder: Number(e.target.value || 0) })}
                    disabled={!canManage}
                    className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50"
                  />
                  <label
                    className={`relative inline-flex h-9 items-center ${canManage ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                    title={d.isActive ? "Active" : "Inactive"}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={d.isActive}
                      disabled={!canManage}
                      onChange={(e) => setDraft(t.id, { isActive: e.target.checked })}
                    />
                    <span className="h-6 w-11 rounded-full border border-gray-300 bg-gray-200 transition-colors peer-checked:border-emerald-500 peer-checked:bg-emerald-500" />
                    <span className="pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
                  </label>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => saveTemplate(t.id)}
                        disabled={!isDirty || updateMutation.isPending}
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm("Delete this template?")) return;
                          deleteMutation.mutate(t.id, {
                            onSuccess: () => toast("Template deleted"),
                            onError: (e) => toast(e instanceof Error ? e.message : "Delete failed", "error"),
                          });
                        }}
                        disabled={deleteMutation.isPending}
                        className="inline-flex h-9 items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs font-medium text-gray-500">
                      {d.isActive ? "Active" : "Inactive"}
                    </div>
                  )}
                </div>
                {!d.content.trim() ? (
                  <p className="mt-1 text-xs text-red-600">Template content cannot be empty.</p>
                ) : null}
              </div>
            );
          })}
          {filtered.length === 0 ? <p className="p-4 text-sm text-gray-500">No templates in this section.</p> : null}
        </div>
      ) : null}

      {canManage ? (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-900">Add new template</h4>
          <div className="grid grid-cols-1 gap-2 xl:grid-cols-[220px_minmax(420px,1fr)_120px]">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Optional title"
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <input
              type="text"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Template content"
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={createTemplate}
              disabled={createMutation.isPending}
              className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-slate-700 px-3 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
