import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type DeliveryCharges = {
  store_id: number;
  packaging_charge_amount: number | null;
  packaging_charge_locked: boolean;
  packaging_charge_next_edit_at: string | null;
  packaging_charge_seconds_until_edit: number;
  delivery_charge_per_km: number | null;
  delivery_charge_locked: boolean;
  delivery_charge_next_edit_at: string | null;
  delivery_charge_seconds_until_edit: number;
  packaging_charge_last_updated_at?: string | null;
  delivery_charge_per_km_last_updated_at?: string | null;
};

export async function getDeliveryCharges(
  storeId: number,
  token: string
): Promise<DeliveryCharges> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/delivery-charges`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to load delivery charges"
    );
  }
  const data = (await res.json()) as Partial<DeliveryCharges>;
  return {
    store_id: Number(data.store_id ?? storeId),
    packaging_charge_amount:
      typeof data.packaging_charge_amount === "number"
        ? data.packaging_charge_amount
        : null,
    packaging_charge_locked: data.packaging_charge_locked === true,
    packaging_charge_next_edit_at:
      typeof data.packaging_charge_next_edit_at === "string"
        ? data.packaging_charge_next_edit_at
        : null,
    packaging_charge_seconds_until_edit:
      typeof data.packaging_charge_seconds_until_edit === "number"
        ? data.packaging_charge_seconds_until_edit
        : 0,
    packaging_charge_last_updated_at:
      typeof (data as any).packaging_charge_last_updated_at === "string"
        ? (data as any).packaging_charge_last_updated_at
        : null,
    delivery_charge_per_km:
      typeof data.delivery_charge_per_km === "number"
        ? data.delivery_charge_per_km
        : null,
    delivery_charge_locked: data.delivery_charge_locked === true,
    delivery_charge_next_edit_at:
      typeof data.delivery_charge_next_edit_at === "string"
        ? data.delivery_charge_next_edit_at
        : null,
    delivery_charge_seconds_until_edit:
      typeof data.delivery_charge_seconds_until_edit === "number"
        ? data.delivery_charge_seconds_until_edit
        : 0,
    delivery_charge_per_km_last_updated_at:
      typeof (data as any).delivery_charge_per_km_last_updated_at === "string"
        ? (data as any).delivery_charge_per_km_last_updated_at
        : null,
  };
}

export async function updateDeliveryCharges(
  storeId: number,
  body: Partial<Pick<DeliveryCharges, "packaging_charge_amount" | "delivery_charge_per_km">>,
  token: string
): Promise<DeliveryCharges> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/delivery-charges`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to update delivery charges"
    );
  }
  const data = (await res.json()) as Partial<DeliveryCharges>;
  return {
    store_id: Number(data.store_id ?? storeId),
    packaging_charge_amount:
      typeof data.packaging_charge_amount === "number"
        ? data.packaging_charge_amount
        : null,
    packaging_charge_locked: data.packaging_charge_locked === true,
    packaging_charge_next_edit_at:
      typeof data.packaging_charge_next_edit_at === "string"
        ? data.packaging_charge_next_edit_at
        : null,
    packaging_charge_seconds_until_edit:
      typeof data.packaging_charge_seconds_until_edit === "number"
        ? data.packaging_charge_seconds_until_edit
        : 0,
    packaging_charge_last_updated_at:
      typeof (data as any).packaging_charge_last_updated_at === "string"
        ? (data as any).packaging_charge_last_updated_at
        : null,
    delivery_charge_per_km:
      typeof data.delivery_charge_per_km === "number"
        ? data.delivery_charge_per_km
        : null,
    delivery_charge_locked: data.delivery_charge_locked === true,
    delivery_charge_next_edit_at:
      typeof data.delivery_charge_next_edit_at === "string"
        ? data.delivery_charge_next_edit_at
        : null,
    delivery_charge_seconds_until_edit:
      typeof data.delivery_charge_seconds_until_edit === "number"
        ? data.delivery_charge_seconds_until_edit
        : 0,
    delivery_charge_per_km_last_updated_at:
      typeof (data as any).delivery_charge_per_km_last_updated_at === "string"
        ? (data as any).delivery_charge_per_km_last_updated_at
        : null,
  };
}

