"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
export interface SystemRoleFormProps {
  /** When set, form loads role and PATCHes; `role_id` / `role_name` are read-only. */
  roleId?: number;
}

function toUpperSnake(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

function parseTypedBoolean(raw: string, defaultWhenEmpty: boolean): boolean {
  const s = raw.trim().toLowerCase();
  if (s === "") return defaultWhenEmpty;
  if (["true", "1", "yes", "y"].includes(s)) return true;
  if (["false", "0", "no", "n"].includes(s)) return false;
  throw new Error(`Invalid boolean "${raw.trim()}" — use true or false`);
}

function boolToInput(v: boolean | null | undefined): string {
  if (v === true) return "true";
  if (v === false) return "false";
  return "false";
}

export function SystemRoleForm({ roleId }: SystemRoleFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = roleId != null && Number.isFinite(roleId) && roleId > 0;

  const [loadingRole, setLoadingRole] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [role_id, setRoleId] = useState("");
  const [role_name, setRoleName] = useState("");
  const [role_display_name, setRoleDisplayName] = useState("");
  const [role_type, setRoleType] = useState("");
  const [role_level, setRoleLevel] = useState("");
  const [is_system_role, setIsSystemRole] = useState("false");
  const [is_custom_role, setIsCustomRole] = useState("true");
  const [is_active, setIsActive] = useState("true");
  const [createdByLabel, setCreatedByLabel] = useState<string | null>(null);
  const [updatedByLabel, setUpdatedByLabel] = useState<string | null>(null);

  const loadRole = useCallback(async () => {
    if (!isEdit || !roleId) return;
    setLoadingRole(true);
    setError(null);
    try {
      const res = await fetch(`/api/system-roles/${roleId}`);
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error || "Failed to load role");
      }
      const d = json.data as Record<string, unknown>;
      setRoleId(String(d.role_id ?? ""));
      setRoleName(String(d.role_name ?? ""));
      setRoleDisplayName(String(d.role_display_name ?? ""));
      setRoleType(String(d.role_type ?? ""));
      setRoleLevel(String(d.role_level ?? ""));
      setIsSystemRole(boolToInput(d.is_system_role as boolean | null));
      setIsCustomRole(boolToInput(d.is_custom_role as boolean | null));
      setIsActive(d.is_active === false ? "false" : "true");

      const cSid = typeof d.created_by_system_user_id === "string" ? d.created_by_system_user_id : "";
      const cName = typeof d.created_by_full_name === "string" ? d.created_by_full_name : "";
      setCreatedByLabel(
        cSid || cName ? [cSid, cName].filter(Boolean).join(" · ") : null
      );
      const uSid = typeof d.updated_by_system_user_id === "string" ? d.updated_by_system_user_id : "";
      const uName = typeof d.updated_by_full_name === "string" ? d.updated_by_full_name : "";
      setUpdatedByLabel(
        uSid || uName ? [uSid, uName].filter(Boolean).join(" · ") : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load role");
    } finally {
      setLoadingRole(false);
    }
  }, [isEdit, roleId]);

  useEffect(() => {
    void loadRole();
  }, [loadRole]);

  const handleRoleIdBlur = () => {
    if (isEdit) return;
    const norm = toUpperSnake(role_id);
    if (norm) setRoleId(norm);
    if (norm && !role_name.trim()) setRoleName(norm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const level = parseInt(role_level.trim(), 10);
      if (!Number.isFinite(level) || level < 1) {
        throw new Error("role_level must be a positive integer");
      }

      let isSys: boolean;
      let isCust: boolean;
      let isAct: boolean;
      try {
        isSys = parseTypedBoolean(is_system_role, false);
        isCust = parseTypedBoolean(is_custom_role, false);
        isAct = parseTypedBoolean(is_active, true);
      } catch (be) {
        throw be instanceof Error ? be : new Error(String(be));
      }

      const roleTypeValue = role_type.trim();
      if (!roleTypeValue) {
        throw new Error("role_type is required.");
      }
      if (roleTypeValue.length > 500) {
        throw new Error("role_type must be at most 500 characters.");
      }

      if (isEdit && roleId) {
        const body = {
          role_display_name: role_display_name.trim(),
          role_type: roleTypeValue,
          role_level: level,
          is_system_role: isSys,
          is_custom_role: isCust,
          is_active: isAct,
        };
        const res = await fetch(`/api/system-roles/${roleId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Update failed");
        }
      } else {
        const body = {
          role_id: toUpperSnake(role_id) || role_id.trim(),
          role_name: role_name.trim(),
          role_display_name: role_display_name.trim(),
          role_type: roleTypeValue,
          role_level: level,
          is_system_role: isSys,
          is_custom_role: isCust,
          is_active: isAct,
        };
        const res = await fetch("/api/system-roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || "Save failed");
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["users", "roles"] });
      await queryClient.invalidateQueries({ queryKey: ["system-roles"] });
      router.push("/dashboard/users/roles");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 bg-white";
  const readOnlyClass = `${fieldClass} bg-gray-50 text-gray-600 cursor-not-allowed`;

  if (loadingRole) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" text="Loading role…" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</div>
      )}

      {isEdit && (createdByLabel || updatedByLabel) && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div className="grid gap-2 sm:grid-cols-2">
            {createdByLabel ? (
              <div>
                <span className="font-medium text-gray-900">Created by</span>
                <div className="mt-0.5 font-mono text-xs text-gray-800">{createdByLabel}</div>
              </div>
            ) : null}
            {updatedByLabel ? (
              <div>
                <span className="font-medium text-gray-900">Last updated by</span>
                <div className="mt-0.5 font-mono text-xs text-gray-800">{updatedByLabel}</div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            role_id <span className="text-red-600">*</span>
          </label>
          <input
            required={!isEdit}
            value={role_id}
            onChange={(e) => setRoleId(e.target.value)}
            onBlur={handleRoleIdBlur}
            className={isEdit ? readOnlyClass : fieldClass}
            placeholder="e.g. SUPER_ADMIN, GMitra-AD, AREA_MANAGER_MERCHANT"
            readOnly={isEdit}
            disabled={isEdit}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            role_name <span className="text-red-600">*</span>
          </label>
          <input
            required={!isEdit}
            value={role_name}
            onChange={(e) => setRoleName(e.target.value)}
            className={isEdit ? readOnlyClass : fieldClass}
            placeholder="e.g. SUPER_ADMIN, GMitra_AD, support_tier_2"
            readOnly={isEdit}
            disabled={isEdit}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            role_display_name <span className="text-red-600">*</span>
          </label>
          <input
            required
            value={role_display_name}
            onChange={(e) => setRoleDisplayName(e.target.value)}
            className={fieldClass}
            placeholder="e.g. Super Admin, GatiMitra Admin, Area Manager (Merchant)"
            autoComplete="off"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            role_type <span className="text-red-600">*</span>
          </label>
          <input
            required
            value={role_type}
            onChange={(e) => setRoleType(e.target.value)}
            className={fieldClass}
            placeholder="e.g. Custom support tier, INTERNAL_OPS"
            maxLength={500}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            role_level <span className="text-red-600">*</span>
          </label>
          <input
            required
            value={role_level}
            onChange={(e) => setRoleLevel(e.target.value)}
            className={fieldClass}
            placeholder="e.g. 1, 10, 50, 100"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>

        <div className="md:col-span-2 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">is_system_role</label>
            <select
              value={is_system_role}
              onChange={(e) => setIsSystemRole(e.target.value)}
              className={fieldClass}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">is_custom_role</label>
            <select
              value={is_custom_role}
              onChange={(e) => setIsCustomRole(e.target.value)}
              className={fieldClass}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">is_active</label>
            <select
              value={is_active}
              onChange={(e) => setIsActive(e.target.value)}
              className={fieldClass}
            >
              <option value="false">false</option>
              <option value="true">true</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 border-t pt-4">
        <LoadingButton type="submit" loading={submitting} loadingText="Saving..." variant="primary" size="md">
          <Save className="mr-2 inline h-4 w-4" aria-hidden />
          {isEdit ? "Update role" : "Create role"}
        </LoadingButton>
      </div>
    </form>
  );
}
