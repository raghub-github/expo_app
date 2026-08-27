import type { UserAppCategoryRow, UserAppCategoryStoreType } from "@/lib/user-app-categories/shared";

export type CategoriesBootstrap = {
  items: UserAppCategoryRow[];
  allTab: { label: string; imageUrl: string | null };
};

const BOOTSTRAP_TIMEOUT_MS = 20_000;

export async function fetchUserAppCategoriesBootstrap(
  storeType: UserAppCategoryStoreType
): Promise<CategoriesBootstrap> {
  const qs = new URLSearchParams({ storeType });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BOOTSTRAP_TIMEOUT_MS);
  try {
    const res = await fetch(`/api/admin/user-app-categories/bootstrap?${qs.toString()}`, {
      credentials: "include",
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data.error === "string" ? data.error : "Failed to load categories");
    }
    return {
      items: Array.isArray(data.items) ? data.items : [],
      allTab: {
        label: data.allTab?.label?.trim() || "All",
        imageUrl: data.allTab?.imageUrl?.trim() || null,
      },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
