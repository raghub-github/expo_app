"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

export type TicketResponseTemplateType = "quick_reply" | "knowledge_base";

export type TicketResponseTemplate = {
  id: number;
  templateType: TicketResponseTemplateType;
  title: string;
  content: string;
  sortOrder: number;
  isActive: boolean;
  updatedAt?: string | null;
};

type TicketResponseTemplatesDto = {
  templates: TicketResponseTemplate[];
  quickReplyTemplates: string[];
  knowledgeBaseSnippets: string[];
  canManage: boolean;
};

const QUERY_KEY = ["ticketResponseTemplates"] as const;
const SNAPSHOT_KEY = "dashboard_snapshot:ticketResponseTemplates:v1";
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

function buildTemplateDto(templates: TicketResponseTemplate[], canManage: boolean): TicketResponseTemplatesDto {
  return {
    templates,
    quickReplyTemplates: templates.filter((t) => t.templateType === "quick_reply").map((t) => t.content),
    knowledgeBaseSnippets: templates.filter((t) => t.templateType === "knowledge_base").map((t) => t.content),
    canManage,
  };
}

function templatesFromSnapshot(): TicketResponseTemplatesDto | undefined {
  const snap = loadClientSnapshot<{
    templates?: Array<{
      id?: number;
      templateType?: string;
      title?: string;
      content?: string;
      sortOrder?: number;
      isActive?: boolean;
      updatedAt?: string | null;
    }>;
    canManage?: boolean;
  }>(SNAPSHOT_KEY, SNAPSHOT_TTL_MS);
  if (!snap || !Array.isArray(snap.templates)) return undefined;
  const templates: TicketResponseTemplate[] = snap.templates
    .map((t) => ({
      id: Number(t.id ?? 0),
      templateType: (t.templateType === "knowledge_base" ? "knowledge_base" : "quick_reply") as TicketResponseTemplate["templateType"],
      title: String(t.title ?? ""),
      content: String(t.content ?? ""),
      sortOrder: Number(t.sortOrder ?? 0),
      isActive: Boolean(t.isActive),
      updatedAt: t.updatedAt ?? null,
    }))
    .filter((t) => t.id > 0 && t.content.trim().length > 0);
  return buildTemplateDto(templates, snap.canManage === true);
}

async function fetchTemplates(): Promise<TicketResponseTemplatesDto> {
  const res = await fetch("/api/tickets/response-templates", { credentials: "include", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load response templates");
  const data = json.data ?? {};
  const templatesRaw = Array.isArray(data.templates) ? data.templates : [];
  const templates: TicketResponseTemplate[] = templatesRaw
    .map((t: Record<string, unknown>) => {
      const tt = t.templateType === "knowledge_base" ? "knowledge_base" : "quick_reply";
      return {
        id: Number(t.id ?? 0),
        templateType: tt,
        title: String(t.title ?? ""),
        content: String(t.content ?? ""),
        sortOrder: Number(t.sortOrder ?? 0),
        isActive: Boolean(t.isActive),
        updatedAt: t.updatedAt ? String(t.updatedAt) : null,
      };
    })
    .filter((t: TicketResponseTemplate) => t.id > 0 && t.content.trim().length > 0);
  return buildTemplateDto(templates, data.canManage === true);
}

export function useTicketResponseTemplatesQuery() {
  const query = useQuery({
    queryKey: QUERY_KEY,
    placeholderData: () => templatesFromSnapshot(),
    queryFn: fetchTemplates,
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!query.data) return;
    saveClientSnapshot(SNAPSHOT_KEY, {
      templates: query.data.templates,
      canManage: query.data.canManage,
    });
  }, [query.data]);

  return query;
}

export function useTicketResponseTemplateCreate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      templateType: TicketResponseTemplateType;
      title: string;
      content: string;
      sortOrder: number;
    }) => {
      const res = await fetch("/api/tickets/response-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || "Create failed");
      return json.data?.template as TicketResponseTemplate;
    },
    onSuccess: (createdTemplate) => {
      queryClient.setQueryData<TicketResponseTemplatesDto>(QUERY_KEY, (prev) => {
        if (!prev) {
          return buildTemplateDto([createdTemplate], true);
        }
        const nextTemplates = [...prev.templates, createdTemplate].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.id - b.id
        );
        return buildTemplateDto(nextTemplates, prev.canManage);
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "inactive" });
    },
  });
}

export function useTicketResponseTemplateUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: number;
      templateType?: TicketResponseTemplateType;
      title?: string;
      content?: string;
      sortOrder?: number;
      isActive?: boolean;
    }) => {
      const { id, ...rest } = payload;
      const res = await fetch(`/api/tickets/response-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(rest),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || "Update failed");
      return json.data?.template as TicketResponseTemplate;
    },
    onSuccess: (updatedTemplate) => {
      queryClient.setQueryData<TicketResponseTemplatesDto>(QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const nextTemplates = prev.templates
          .map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t))
          .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
        return buildTemplateDto(nextTemplates, prev.canManage);
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "inactive" });
    },
  });
}

export function useTicketResponseTemplateDelete() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/tickets/response-templates/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) throw new Error(json?.error || "Delete failed");
      return json.data as { deletedId: number };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<TicketResponseTemplatesDto>(QUERY_KEY, (prev) => {
        if (!prev) return prev;
        const nextTemplates = prev.templates.filter((t) => t.id !== result.deletedId);
        return buildTemplateDto(nextTemplates, prev.canManage);
      });
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY, refetchType: "inactive" });
    },
  });
}
