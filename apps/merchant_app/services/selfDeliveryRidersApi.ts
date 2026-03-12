import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type SelfDeliveryRider = {
  id: number;
  store_id: number;
  rider_name: string;
  rider_mobile: string;
  rider_email: string | null;
  vehicle_number: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

export async function getSelfDeliveryRiders(
  storeId: number,
  token: string,
  activeOnly: boolean = true
): Promise<SelfDeliveryRider[]> {
  const qs = activeOnly ? "?active_only=true" : "?active_only=false";
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/self-delivery-riders${qs}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to load self-delivery riders"
    );
  }
  const data = (await res.json()) as Array<Partial<SelfDeliveryRider>>;
  return (Array.isArray(data) ? data : []).map((r) => ({
    id: Number(r.id ?? 0),
    store_id: Number(r.store_id ?? storeId),
    rider_name: String(r.rider_name ?? ""),
    rider_mobile: String(r.rider_mobile ?? ""),
    rider_email: (r.rider_email as string | null) ?? null,
    vehicle_number: (r.vehicle_number as string | null) ?? null,
    is_primary: r.is_primary === true,
    is_active: r.is_active !== false,
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : (r.created_at as any)?.toString?.(),
    updated_at:
      typeof r.updated_at === "string"
        ? r.updated_at
        : (r.updated_at as any)?.toString?.(),
  }));
}

export async function createSelfDeliveryRider(
  storeId: number,
  payload: {
    rider_name: string;
    rider_mobile: string;
    rider_email?: string | null;
    vehicle_number?: string | null;
    is_primary?: boolean;
  },
  token: string
): Promise<SelfDeliveryRider> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/self-delivery-riders`,
    token,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to create rider"
    );
  }
  const r = (await res.json()) as Partial<SelfDeliveryRider>;
  return {
    id: Number(r.id ?? 0),
    store_id: Number(r.store_id ?? storeId),
    rider_name: String(r.rider_name ?? payload.rider_name),
    rider_mobile: String(r.rider_mobile ?? payload.rider_mobile),
    rider_email: (r.rider_email as string | null) ?? payload.rider_email ?? null,
    vehicle_number:
      (r.vehicle_number as string | null) ?? payload.vehicle_number ?? null,
    is_primary: r.is_primary === true,
    is_active: r.is_active !== false,
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : (r.created_at as any)?.toString?.(),
    updated_at:
      typeof r.updated_at === "string"
        ? r.updated_at
        : (r.updated_at as any)?.toString?.(),
  };
}

export async function updateSelfDeliveryRider(
  storeId: number,
  riderId: number,
  patch: Partial<{
    rider_name: string;
    rider_mobile: string;
    rider_email: string | null;
    vehicle_number: string | null;
    is_primary: boolean;
    is_active: boolean;
  }>,
  token: string
): Promise<SelfDeliveryRider> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/self-delivery-riders/${riderId}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to update rider"
    );
  }
  const r = (await res.json()) as Partial<SelfDeliveryRider>;
  return {
    id: Number(r.id ?? riderId),
    store_id: Number(r.store_id ?? storeId),
    rider_name: String(r.rider_name ?? ""),
    rider_mobile: String(r.rider_mobile ?? ""),
    rider_email: (r.rider_email as string | null) ?? null,
    vehicle_number: (r.vehicle_number as string | null) ?? null,
    is_primary: r.is_primary === true,
    is_active: r.is_active !== false,
    created_at:
      typeof r.created_at === "string"
        ? r.created_at
        : (r.created_at as any)?.toString?.(),
    updated_at:
      typeof r.updated_at === "string"
        ? r.updated_at
        : (r.updated_at as any)?.toString?.(),
  };
}

export async function deleteSelfDeliveryRider(
  storeId: number,
  riderId: number,
  token: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/self-delivery-riders/${riderId}`,
    token,
    {
      method: "DELETE",
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to delete rider"
    );
  }
}

