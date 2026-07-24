import { getConfig } from "@/config/env";

export type AppAssetItem = {
  id: string;
  section: string;
  label: string;
  description: string;
  proxyUrl: string | null;
  url: string | null;
  sortOrder: number;
};

export type AppAssetsResponse = {
  app: "merchant";
  assets: Record<string, AppAssetItem>;
  items: AppAssetItem[];
};

export async function fetchMerchantAppAssets(
  signal?: AbortSignal
): Promise<AppAssetsResponse> {
  const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/app-assets/merchant`, {
    headers: { "X-Silent-Error": "1" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`app-assets/merchant HTTP ${res.status}`);
  }
  return (await res.json()) as AppAssetsResponse;
}
