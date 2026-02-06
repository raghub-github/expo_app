/**
 * Type-safe permission keys and helpers.
 * Use these constants to avoid typos and get consistent module:action checks.
 */

import type { AccessModule, PermissionAction } from "./engine";

/** Build a single permission key for fast client-side Set.has() checks. */
export function toPermissionKey(module: AccessModule, action: PermissionAction): string {
  return `${module}:${action}`;
}

/** Parse "MODULE:ACTION" into { module, action } or null. */
export function parsePermissionKey(
  key: string
): { module: AccessModule; action: PermissionAction } | null {
  const [module, action] = key.split(":");
  if (!module || !action) return null;
  return { module: module as AccessModule, action: action as PermissionAction };
}

/** Build an array of permission keys from a list of { module, action }. */
export function toPermissionKeys(
  permissions: Array<{ module: string; action: string; resourceType?: string }>
): string[] {
  return permissions.map((p) => toPermissionKey(p.module as AccessModule, p.action as PermissionAction));
}
