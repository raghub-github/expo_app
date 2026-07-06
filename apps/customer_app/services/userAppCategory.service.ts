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

export type UserAppCategoryAllTab = {
  label: string;
  imageUrl: string | null;
};

export type UserAppCategoriesResponse = {
  items: UserAppCategoryItem[];
  allTab: UserAppCategoryAllTab;
};

export async function fetchUserAppCategories(params?: {
  storeType?: string;
}): Promise<UserAppCategoriesResponse> {
  const { data } = await api.get<UserAppCategoriesResponse>("/v1/user-app/categories", {
    params: {
      store_type: params?.storeType ?? "FOOD",
    },
  });
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    allTab: data?.allTab ?? { label: "All", imageUrl: null },
  };
}
