import api from "./api";

export type GroceryHomeMenuCategory = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
};

export async function getGroceryHomeMenuCategories(params: {
  lat?: number;
  lng?: number;
  vegOnly?: boolean;
  storeIds?: string[];
}): Promise<GroceryHomeMenuCategory[]> {
  try {
    const { data } = await api.get<{ items: GroceryHomeMenuCategory[] }>(
      "/v1/merchants/grocery-home-categories",
      {
        params: {
          ...(params.lat != null ? { lat: params.lat } : {}),
          ...(params.lng != null ? { lng: params.lng } : {}),
          ...(params.vegOnly ? { veg: true } : {}),
          ...(params.storeIds?.length ? { storeIds: params.storeIds.join(",") } : {}),
        },
      }
    );
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}
