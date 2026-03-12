import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type StoreHoliday = {
  id: string;
  store_id: number;
  holiday_name: string;
  holiday_type: string | null;
  holiday_date: string; // YYYY-MM-DD
  is_full_day: boolean;
  closed_from: string | null;
  closed_till: string | null;
  closure_reason: string | null;
  created_at: string;
};

export type StoreHolidaysResponse = {
  holidays: StoreHoliday[];
};

export async function getScheduledOffHolidays(
  storeId: number,
  token: string,
  fromDate?: string
): Promise<StoreHoliday[]> {
  const params = new URLSearchParams();
  params.set("type", "scheduled_off");
  if (fromDate) params.set("from", fromDate.slice(0, 10));

  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/holidays?${params.toString()}`,
    token
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load scheduled off days");
  }
  const data = (await res.json()) as StoreHolidaysResponse;
  return data.holidays ?? [];
}

