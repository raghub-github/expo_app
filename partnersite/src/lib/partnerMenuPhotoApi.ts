export type MenuItemImageRow = {
  id: number;
  image_url: string;
  is_primary: boolean;
  display_order: number;
  moderation_status?: string | null;
  rejection_reason?: string | null;
  moderated_at?: string | null;
  created_at?: string | null;
};

export type MenuItemDetailResponse = {
  id: number;
  item_id: string;
  item_name: string;
  item_image_url?: string | null;
  approval_status?: string | null;
  rejection_reason?: string | null;
  images: MenuItemImageRow[];
};

export async function fetchPartnerMenuItem(
  storeId: string,
  itemId: number,
): Promise<MenuItemDetailResponse | null> {
  const res = await fetch(
    `/api/merchant/menu-items/${itemId}?storeId=${encodeURIComponent(storeId)}`,
    { credentials: "include" },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Item fetch failed: ${res.status}`);
  }
  return res.json() as Promise<MenuItemDetailResponse>;
}

export async function uploadPartnerMenuItemImage(
  storeId: string,
  itemId: number,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<{ id: number; image_url: string; r2_key?: string }> {
  const formData = new FormData();
  formData.append("file", file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `/api/merchant/menu-items/${itemId}/images?storeId=${encodeURIComponent(storeId)}`,
    );
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (!onProgress || !e.lengthComputable) return;
      onProgress(Math.min(0.95, e.loaded / e.total));
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve(json as { id: number; image_url: string; r2_key?: string });
          return;
        }
        reject(new Error((json as { error?: string; message?: string }).error || (json as { message?: string }).message || "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };

    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(formData);
  });
}

export async function deletePartnerMenuItemImage(storeId: string, imageId: number): Promise<void> {
  const res = await fetch(
    `/api/merchant/menu-items/images/${imageId}?storeId=${encodeURIComponent(storeId)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Delete image failed: ${res.status}`);
  }
}
