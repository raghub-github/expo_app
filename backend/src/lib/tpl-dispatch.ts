/**
 * Dispatch Engine — Phase 6: Third-Party Logistics (3PL) dispatch SCAFFOLD.
 *
 * The internal-vs-3PL DECISION already exists:
 *   - geo_coverage.tpl_enabled (Phase 1) says whether 3PL is allowed at a location.
 *   - checkDispatchServiceability (Phase 2) allows placement when no internal rider is
 *     available but tpl is enabled.
 *
 * This module is the PROVIDER side: a registry-backed resolver + an adapter interface.
 * There is intentionally NO live wiring into the dispatch exhaustion path yet — handing
 * an order to a provider without a registered adapter would create an unfulfillable
 * order. Register an adapter (registerTplAdapter) for a provider `code`, then call
 * dispatchOrderToTpl from the exhaustion path once a real integration exists.
 */

import { getSql } from "../db/client.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";
import { recordDispatchEvent } from "./dispatch-events.js";

export type TplProvider = {
  id: number;
  code: string;
  name: string;
  enabled: boolean;
  priority: number;
  serviceTypes: string[];
  config: Record<string, unknown>;
};

export type TplDispatchResult =
  | { accepted: true; externalRef: string }
  | { accepted: false; reason: string };

/** A concrete provider integration implements this to actually hand off an order. */
export interface TplDispatchAdapter {
  readonly code: string;
  dispatch(input: {
    orderCoreId: number;
    serviceType: DispatchServiceType;
    provider: TplProvider;
  }): Promise<TplDispatchResult>;
}

const adapterRegistry = new Map<string, TplDispatchAdapter>();

/** Register a real provider integration by its `code`. */
export function registerTplAdapter(adapter: TplDispatchAdapter): void {
  adapterRegistry.set(adapter.code, adapter);
}

function normalizeServiceTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
}

/** Enabled providers supporting a service, ordered by priority (lower first). */
export async function listEnabledTplProviders(
  serviceType: DispatchServiceType
): Promise<TplProvider[]> {
  const sql = getSql();
  const svc = serviceType === "person_ride" ? "ride" : serviceType;
  const rows = (await sql`
    SELECT id, code, name, enabled, priority, service_types, config
    FROM tpl_providers
    WHERE enabled = TRUE
      AND (
        service_types @> ${JSON.stringify([svc])}::jsonb
        OR service_types @> ${JSON.stringify([serviceType])}::jsonb
      )
    ORDER BY priority ASC, id ASC
  `) as Array<Record<string, unknown>>;

  return (rows ?? []).map((r) => ({
    id: Number(r.id),
    code: String(r.code),
    name: String(r.name),
    enabled: r.enabled !== false,
    priority: Number(r.priority),
    serviceTypes: normalizeServiceTypes(r.service_types),
    config: (r.config && typeof r.config === "object" ? r.config : {}) as Record<string, unknown>,
  }));
}

/** Highest-priority enabled provider for a service (or null). */
export async function resolveTplProviderForService(
  serviceType: DispatchServiceType
): Promise<TplProvider | null> {
  const providers = await listEnabledTplProviders(serviceType);
  return providers[0] ?? null;
}

/**
 * Hand an order to a 3PL provider. Resolves the best provider, then calls its registered
 * adapter. Records a 3pl_triggered event. Returns a not-configured result (never throws)
 * when no provider or no adapter is available — the caller keeps the order in the
 * internal flow / existing timeout handling.
 */
export async function dispatchOrderToTpl(
  orderCoreId: number,
  serviceType: DispatchServiceType
): Promise<{ triggered: boolean; providerCode?: string; reason?: string }> {
  const provider = await resolveTplProviderForService(serviceType).catch(() => null);
  if (!provider) {
    return { triggered: false, reason: "no_enabled_provider" };
  }

  const adapter = adapterRegistry.get(provider.code);
  if (!adapter) {
    // Provider configured but no integration wired — record intent, do not fake a handoff.
    void recordDispatchEvent({
      orderCoreId,
      serviceType,
      eventType: "3pl_triggered",
      metadata: { providerCode: provider.code, status: "no_adapter" },
    });
    return { triggered: false, providerCode: provider.code, reason: "no_adapter_registered" };
  }

  try {
    const result = await adapter.dispatch({ orderCoreId, serviceType, provider });
    void recordDispatchEvent({
      orderCoreId,
      serviceType,
      eventType: "3pl_triggered",
      metadata: {
        providerCode: provider.code,
        status: result.accepted ? "accepted" : "rejected",
        ...(result.accepted ? { externalRef: result.externalRef } : { reason: result.reason }),
      },
    });
    return result.accepted
      ? { triggered: true, providerCode: provider.code }
      : { triggered: false, providerCode: provider.code, reason: result.reason };
  } catch (err) {
    return { triggered: false, providerCode: provider.code, reason: (err as Error).message };
  }
}
