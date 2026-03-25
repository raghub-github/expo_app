/**
 * App browse categories from user_app_category (name, image, store_type, status).
 */

import api from "./api";

export type UserAppCategoryItem = {
  id: number;
  name: string;
  imageUrl: string | null;
  displayOrder: number;
  storeType: string;
  status: string;
};

export async function fetchUserAppCategories(params?: { storeType?: string }): Promise<UserAppCategoryItem[]> {
  const { data } = await api.get<{ items: UserAppCategoryItem[] }>("/v1/user-app/categories", {
    params: {
      store_type: params?.storeType ?? "FOOD",
    },
  });
  return Array.isArray(data?.items) ? data.items : [];
}
