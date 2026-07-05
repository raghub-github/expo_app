import api from "./api";

export type FoodItemUnderPrice = {
  itemId: string;
  menuItemPk: number;
  name: string;
  imageUrl: string | null;
  price: number;
  basePrice: number | null;
  discountPercentage?: number | null;
  storePublicId: string;
  storeName: string;
  isVeg: boolean;
  isPopular?: boolean;
  itemTags?: string[];
};

export type StoreFoodItemsUnderPrice = {
  storePublicId: string;
  storeName: string;
  avgRating: number | null;
  totalReviews: number | null;
  deliveryTime: string | null;
  distanceKm: number | null;
  items: FoodItemUnderPrice[];
};

export async function fetchFoodItemsUnderPrice(params: {
  lat: number;
  lng: number;
  maxPrice?: number;
  limit?: number;
  vegOnly?: boolean;
}): Promise<FoodItemUnderPrice[]> {
  const { data } = await api.get<{ items: FoodItemUnderPrice[] }>("/v1/food-home/items-under-price", {
    params: {
      lat: params.lat,
      lng: params.lng,
      max_price: params.maxPrice,
      limit: params.limit,
      veg: params.vegOnly ? true : undefined,
    },
  });
  return Array.isArray(data?.items) ? data.items : [];
}

export async function fetchFoodItemsUnderPriceGrouped(params: {
  lat: number;
  lng: number;
  maxPrice?: number;
  vegOnly?: boolean;
  maxStores?: number;
  itemsPerStore?: number;
}): Promise<StoreFoodItemsUnderPrice[]> {
  const { data } = await api.get<{ stores: StoreFoodItemsUnderPrice[] }>(
    "/v1/food-home/items-under-price/grouped",
    {
      params: {
        lat: params.lat,
        lng: params.lng,
        max_price: params.maxPrice,
        veg: params.vegOnly ? true : undefined,
        max_stores: params.maxStores,
        items_per_store: params.itemsPerStore,
      },
    }
  );
  return Array.isArray(data?.stores) ? data.stores : [];
}
