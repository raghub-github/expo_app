import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export async function registerStorePushToken(
  storeId: number,
  token: string,
  authToken: string,
  platform?: string
): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/push-token`,
    authToken,
    {
      method: "POST",
      body: JSON.stringify({ token, platform }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || (err as any).message || "Failed to register push token");
  }
}

