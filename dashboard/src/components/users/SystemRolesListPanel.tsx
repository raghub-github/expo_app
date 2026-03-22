"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { Search, Filter, ChevronDown, Shield, Pencil, ChevronLeft, ChevronRight } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  useSystemRolesListQuery,
  type SystemRoleListRow,
} from "@/hooks/queries/useSystemRolesListQuery";

export type { SystemRoleListRow };

const DEFAULT_LIMIT = 20;

function generateRolePageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  const pages: (number | string)[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
    return pages;
  }
  pages.push(1);
  if (currentPage > 3) pages.push("...");
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (currentPage < totalPages - 2) pages.push("...");
  pages.push(totalPages);
  return pages;
}

export function SystemRolesToolbar({
  search,
  onSearchChange,
  roleType,
  onRoleTypeChange,
  isActive,
  onIsActiveChange,
  scope,
  onScopeChange,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  roleType: string;
  onRoleTypeChange: (v: string) => void;
  isActive: "" | "true" | "false";
  onIsActiveChange: (v: "" | "true" | "false") => void;
  scope: "" | "system" | "custom";
  onScopeChange: (v: "" | "system" | "custom") => void;
}) {
  return (
    <div className="flex shrink-0 flex-nowrap items-center gap-1.5">
      <div className="relative min-w-[13rem] w-[13rem] shrink-0 sm:min-w-[17rem] sm:w-72">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
        <input
          type="text"
          placeholder="Search…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-9 pr-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="relative w-[6.5rem] shrink-0 sm:w-28">
        <Filter className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 transform text-gray-400" />
        <input
          type="text"
          placeholder="Type…"
          value={roleType}
          onChange={(e) => onRoleTypeChange(e.target.value)}
          className="w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm"
          autoComplete="off"
        />
      </div>

      <div className="relative w-[6.75rem] shrink-0">
        <select
          value={isActive}
          onChange={(e) => onIsActiveChange(e.target.value as "" | "true" | "false")}
          className="w-full cursor-pointer appearance-none rounded-md border border-gray-300 bg-white py-1.5 pl-1.5 pr-6 text-xs text-gray-900 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm"
        >
          <option value="">All status</option>
          <option value="true">Active</option>
          <option value="false">Inactive</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 transform text-gray-400" />
      </div>

      <div className="relative w-[7.25rem] shrink-0 sm:w-32">
        <Shield className="pointer-events-none absolute left-2 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 transform text-gray-400" />
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as "" | "system" | "custom")}
          className="w-full cursor-pointer appearance-none rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-6 text-xs text-gray-900 hover:border-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-sm"
        >
          <option value="">All roles</option>
          <option value="system">System</option>
          <option value="custom">Custom</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 transform text-gray-400" />
      </div>
    </div>
  );
}

function ActorColumn({
  systemUserId,
  fullName,
}: {
  systemUserId: string | null | undefined;
  fullName: string | null | undefined;
}) {
  if (!systemUserId && !fullName) {
    return <span className="text-gray-400">—</span>;
  }
  return (
    <div className="max-w-[6.5rem] text-xs leading-snug break-words sm:max-w-[8rem]">
      {systemUserId ? (
        <div className="font-mono font-semibold text-gray-900">{systemUserId}</div>
      ) : null}
      {fullName ? <div className="break-words text-gray-600">{fullName}</div> : null}
    </div>
  );
}

function SystemRolesTableBody({ roles }: { roles: SystemRoleListRow[] }) {
  const colCount = 11;

  const th =
    "whitespace-normal break-words px-1 py-1.5 text-left text-xs font-semibold uppercase leading-tight tracking-wide text-gray-600 sm:text-sm";
  const td = "px-1 py-1.5 align-middle text-xs text-gray-900 sm:text-sm";
  const tdMuted = `${td} text-gray-600`;
  const tdMono = `${td} font-mono text-gray-700`;
  const tdActor = "whitespace-normal px-1 py-1.5 align-top text-xs text-gray-600 sm:text-sm";

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className={th} title="Numeric id">
              #
            </th>
            <th className={th} title="role_id">
              Role ID
            </th>
            <th className={th} title="role_display_name">
              Display name
            </th>
            <th className={th} title="role_type">
              Role type
            </th>
            <th className={th} title="role_level">
              Level
            </th>
            <th className={th} title="Created by">
              Created by
            </th>
            <th className={th} title="Last updated by">
              Updated by
            </th>
            <th className={th} title="is_system_role">
              System
            </th>
            <th className={th} title="is_custom_role">
              Custom
            </th>
            <th className={th} title="is_active">
              Active
            </th>
            <th className={`${th} text-right`} title="Actions">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {roles.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-1 py-6 text-center text-sm text-gray-500">
                No roles found.
              </td>
            </tr>
          ) : (
            roles.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50/80">
                <td className={`${tdMuted} font-mono tabular-nums`}>{r.id}</td>
                <td className={`${tdMono} max-w-[5.5rem] whitespace-normal break-words`}>
                  {r.role_id}
                </td>
                <td className={`${tdMuted} max-w-[6rem] whitespace-normal break-words`}>
                  {r.role_display_name}
                </td>
                <td className={`${tdMuted} max-w-[6rem] whitespace-normal break-words`}>
                  {r.role_type}
                </td>
                <td className={`${tdMuted} text-center tabular-nums`}>{r.role_level}</td>
                <td className={tdActor}>
                  <ActorColumn
                    systemUserId={r.created_by_system_user_id}
                    fullName={r.created_by_full_name}
                  />
                </td>
                <td className={tdActor}>
                  <ActorColumn
                    systemUserId={r.updated_by_system_user_id}
                    fullName={r.updated_by_full_name}
                  />
                </td>
                <td className={`${td} text-center`}>
                  <span
                    className={
                      r.is_system_role === true
                        ? "inline-block rounded bg-slate-100 px-1 py-px text-xs font-semibold text-slate-800"
                        : "inline-block rounded bg-gray-100 px-1 py-px text-xs font-semibold text-gray-600"
                    }
                  >
                    {r.is_system_role === true ? "Y" : "N"}
                  </span>
                </td>
                <td className={`${td} text-center`}>
                  <span
                    className={
                      r.is_custom_role === true
                        ? "inline-block rounded bg-violet-50 px-1 py-px text-xs font-semibold text-violet-800"
                        : "inline-block rounded bg-gray-100 px-1 py-px text-xs font-semibold text-gray-600"
                    }
                  >
                    {r.is_custom_role === true ? "Y" : "N"}
                  </span>
                </td>
                <td className={`${td} text-center`}>
                  <span
                    className={
                      r.is_active !== false
                        ? "inline-block rounded bg-blue-100 px-1 py-px text-xs font-semibold text-blue-800"
                        : "inline-block rounded bg-gray-100 px-1 py-px text-xs font-semibold text-gray-600"
                    }
                  >
                    {r.is_active !== false ? "Y" : "N"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-1 py-1.5 text-right align-middle">
                  <Link
                    href={`/dashboard/users/roles/${r.id}/edit`}
                    className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-50 sm:text-sm"
                    title="Edit role"
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">Edit</span>
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

interface SystemRolesListPanelProps {
  enabled?: boolean;
  toolbarTrailing?: ReactNode;
}

export function SystemRolesListPanel({ enabled = true, toolbarTrailing }: SystemRolesListPanelProps) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleTypeFilter, setRoleTypeFilter] = useState("");
  const [debouncedRoleType, setDebouncedRoleType] = useState("");
  const [isActive, setIsActive] = useState<"" | "true" | "false">("");
  const [scope, setScope] = useState<"" | "system" | "custom">("");
  const [page, setPage] = useState(1);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roleTypeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(search), 500);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [search]);

  useEffect(() => {
    if (roleTypeTimeoutRef.current) clearTimeout(roleTypeTimeoutRef.current);
    roleTypeTimeoutRef.current = setTimeout(() => setDebouncedRoleType(roleTypeFilter.trim()), 400);
    return () => {
      if (roleTypeTimeoutRef.current) clearTimeout(roleTypeTimeoutRef.current);
    };
  }, [roleTypeFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, debouncedRoleType, isActive, scope]);

  const { data, isLoading, error } = useSystemRolesListQuery({
    search: debouncedSearch || undefined,
    roleType: debouncedRoleType || undefined,
    isActive: isActive || undefined,
    scope: scope || undefined,
    page,
    limit: DEFAULT_LIMIT,
    enabled,
  });

  const roles = data?.roles ?? [];
  const pagination = data?.pagination ?? {
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 0,
    totalPages: 0,
  };

  useEffect(() => {
    const tp = pagination.totalPages;
    const total = pagination.total;
    if (total === 0 && page > 1) {
      setPage(1);
      return;
    }
    if (tp > 0 && page > tp) setPage(tp);
  }, [pagination.totalPages, pagination.total, page]);

  const err = error instanceof Error ? error : error ? new Error(String(error)) : null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-gray-200 p-2.5 [scrollbar-width:thin]">
        <SystemRolesToolbar
          search={search}
          onSearchChange={setSearch}
          roleType={roleTypeFilter}
          onRoleTypeChange={setRoleTypeFilter}
          isActive={isActive}
          onIsActiveChange={setIsActive}
          scope={scope}
          onScopeChange={setScope}
        />
        {toolbarTrailing ? <div className="ml-auto shrink-0 pl-1">{toolbarTrailing}</div> : null}
      </div>

      {err ? (
        <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-800">{err.message}</div>
      ) : null}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" text="Loading roles…" />
        </div>
      ) : (
        <SystemRolesTableBody roles={roles} />
      )}

      {!isLoading && !err && pagination.totalPages > 0 && (
        <div className="flex flex-col items-center justify-between gap-4 border-t border-gray-200 px-4 py-4 sm:flex-row sm:px-6">
          <div className="text-center text-xs text-gray-700 sm:text-left sm:text-sm">
            Showing{" "}
            <span className="font-semibold text-gray-900">
              {(pagination.page - 1) * pagination.limit + 1}
            </span>{" "}
            to{" "}
            <span className="font-semibold text-gray-900">
              {Math.min(pagination.page * pagination.limit, pagination.total)}
            </span>{" "}
            of <span className="font-semibold text-gray-900">{pagination.total}</span> roles
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </button>
            <div className="flex items-center gap-1">
              {generateRolePageNumbers(pagination.page, pagination.totalPages).map((p, index) => {
                if (p === "...") {
                  return (
                    <span key={`e-${index}`} className="px-2 font-medium text-gray-500">
                      ...
                    </span>
                  );
                }
                const pageNum = p as number;
                const isActive = pageNum === pagination.page;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    className={`min-w-[40px] rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-blue-600 text-white shadow-md ring-2 ring-blue-200"
                        : "border-2 border-gray-300 bg-white text-gray-700 shadow-sm hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100"
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:border-gray-400 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
