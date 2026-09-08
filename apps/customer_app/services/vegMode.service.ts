import api from "./api";
import type { VegModeStoreScope } from "@/lib/vegMode";

export type VegModePreferenceDto = {
  enabled: boolean;
  storeScope: VegModeStoreScope;
  weekdays: number[] | null;
  updatedAt: string;
};

export async function getVegModePreference(): Promise<VegModePreferenceDto> {
  const { data } = await api.get<VegModePreferenceDto>("/v1/veg-mode");
  return {
    enabled: data?.enabled === true,
    storeScope: data?.storeScope === "pure_veg_only" ? "pure_veg_only" : "all_restaurants",
    weekdays: Array.isArray(data?.weekdays) ? data.weekdays : null,
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : new Date(0).toISOString(),
  };
}

export async function putVegModePreference(input: {
  enabled: boolean;
  storeScope: VegModeStoreScope;
  weekdays: number[] | null;
}): Promise<VegModePreferenceDto> {
  const { data } = await api.put<VegModePreferenceDto>("/v1/veg-mode", input);
  return {
    enabled: data?.enabled === true,
    storeScope: data?.storeScope === "pure_veg_only" ? "pure_veg_only" : "all_restaurants",
    weekdays: Array.isArray(data?.weekdays) ? data.weekdays : input.weekdays,
    updatedAt: typeof data?.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
  };
}
