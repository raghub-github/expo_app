/**
 * Dispatch Engine — Phase 6: Third-Party Logistics (3PL) dispatch resolver + adapter.
 *
 * REUSES the existing 3PL infrastructure (dashboard/drizzle/0049_create_3pl_tables.sql):
 *   tpl_providers (status/provider_type/integration_type/supported_order_types),
 *   tpl_provider_capabilities, tpl_order_requests, tpl_order_status_updates, etc.
 * No new tables. This module adds the dispatch-side resolver + a pluggable adapter so a
 * real provider integration can be wired in.
 *
 * The internal-vs-3PL DECISION already exists upstream: geo_coverage.tpl_enabled (Phase 1)
 * gates whether 3PL is allowed at a location, honored by checkDispatchServiceability
 * (Phase 2). There is intentionally NO live wiring into the dispatch exhaustion path —
 * handing an order to a provider without a registered adapter would create an
 * unfulfillable order. Register an adapter, then call dispatchOrderToTpl.
 */

import { getSql } from "../db/client.js";
import type { DispatchServiceType } from "./order-assignment-engine.js";
import { recordDispatchEvent } from "./dispatch-events.js";

export type TplProvider = {
  /** Numeric PK (tpl_providers.id). */
  id: number;
  /** Stable text code (tpl_providers.provider_id) — key adapters by this. */
  code: string;
  name: string;
  providerType: string;
  integrationType: string;
  supportedOrderTypes: string[];
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
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

/** Register a real provider integration by its `code` (tpl_providers.provider_id). */
export function registerTplAdapter(adapter: TplDispatchAdapter): void {
  adapterRegistry.set(adapter.code, adapter);
}

function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim().toLowerCase()).filter(Boolean);
  return [];
}

function toObject(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

/**
 * Active outbound-capable providers for a service, using the existing tpl_providers
 * schema (status = 'active', integration outbound/bidirectional, provider_type 'multi'
 * or the service, or supported_order_types containing the service).
 */
export async function listActiveTplProviders(
  serviceType: DispatchServiceType
): Promise<TplProvider[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, provider_id, provider_name, provider_type, integration_type,
           supported_order_types, capabilities, metadata
    FROM tpl_providers
    WHERE status = 'active'
      AND integration_type IN ('outbound', 'bidirectional')
      AND (
        provider_type = 'multi'
        OR provider_type = ${serviceType}
        OR ${serviceType} = ANY(supported_order_types)
      )
    ORDER BY COALESCE(commission_rate, 999999) ASC, id ASC
  `) as Array<Record<string, unknown>>;

  return (rows ?? []).map((r) => ({
    id: Number(r.id),
    code: String(r.provider_id),
    name: String(r.provider_name),
    providerType: String(r.provider_type),
    integrationType: String(r.integration_type),
    supportedOrderTypes: toStringArray(r.supported_order_types),
    capabilities: toObject(r.capabilities),
    metadata: toObject(r.metadata),
  }));
}

/** Best (lowest-commission) active provider for a service, or null. */
export async function resolveTplProviderForService(
  serviceType: DispatchServiceType
): Promise<TplProvider | null> {
  const providers = await listActiveTplProviders(serviceType);
  return providers[0] ?? null;
}

/**
 * Hand an order to a 3PL provider. Resolves the best provider then calls its registered
 * adapter. Records a 3pl_triggered event. Returns not-configured (never throws) when no
 * provider or no adapter is available — the caller keeps the order in the internal flow.
 */
export async function dispatchOrderToTpl(
  orderCoreId: number,
  serviceType: DispatchServiceType
): Promise<{ triggered: boolean; providerCode?: string; reason?: string }> {
  const provider = await resolveTplProviderForService(serviceType).catch(() => null);
  if (!provider) {
    return { triggered: false, reason: "no_active_provider" };
  }

  const adapter = adapterRegistry.get(provider.code);
  if (!adapter) {
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
