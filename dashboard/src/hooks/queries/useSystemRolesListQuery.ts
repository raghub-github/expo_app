"use client";

import { useQuery } from "@tanstack/react-query";

export type SystemRoleListRow = {
  id: number;
  role_id: string;
  role_name: string;
  role_display_name: string;
  role_type: string;
  role_level: number;
  is_system_role: boolean | null;
  is_custom_role: boolean | null;
  is_active: boolean | null;
  created_by: number | null;
  updated_by: number | null;
  created_by_system_user_id: string | null;
  created_by_full_name: string | null;
  updated_by_system_user_id: string | null;
  updated_by_full_name: string | null;
};

export type SystemRolesListPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type SystemRolesListResult = {
  roles: SystemRoleListRow[];
  pagination: SystemRolesListPagination;
};

export type SystemRolesListQueryParams = {
  search?: string;
  roleType?: string;
  isActive?: "" | "true" | "false";
  scope?: "" | "system" | "custom";
  page?: number;
  limit?: number;
  enabled?: boolean;
};

function buildQueryString(p: Omit<SystemRolesListQueryParams, "enabled">): string {
  const sp = new URLSearchParams();
  const search = p.search?.trim();
  if (search) sp.set("search", search);
  if (p.roleType?.trim()) sp.set("roleType", p.roleType.trim());
  if (p.isActive === "true" || p.isActive === "false") sp.set("isActive", p.isActive);
  if (p.scope === "system" || p.scope === "custom") sp.set("scope", p.scope);
  sp.set("page", String(Math.max(1, p.page ?? 1)));
  sp.set("limit", String(Math.min(100, Math.max(1, p.limit ?? 20))));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useSystemRolesListQuery(params: SystemRolesListQueryParams) {
  const { enabled = true, ...rest } = params;
  const qs = buildQueryString(rest);

  return useQuery({
    queryKey: ["system-roles", "list", rest],
    queryFn: async () => {
      const res = await fetch(`/api/system-roles${qs}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load roles");
      const roles = (json.data?.roles ?? []) as SystemRoleListRow[];
      const pagination = json.data?.pagination as SystemRolesListPagination | undefined;
      return {
        roles,
        pagination: pagination ?? {
          page: rest.page ?? 1,
          limit: rest.limit ?? 20,
          total: roles.length,
          totalPages: roles.length > 0 ? 1 : 0,
        },
      } satisfies SystemRolesListResult;
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
