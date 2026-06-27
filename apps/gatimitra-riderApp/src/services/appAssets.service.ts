import { getRiderAppConfig } from "@/src/config/env";

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
  app: "rider";
  assets: Record<string, AppAssetItem>;
  items: AppAssetItem[];
};

export async function fetchRiderAppAssets(): Promise<AppAssetsResponse> {
  const base = getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/app-assets/rider`, {
    headers: { "X-Silent-Error": "1" },
  });
  if (!res.ok) {
    throw new Error(`app-assets/rider HTTP ${res.status}`);
  }
  return (await res.json()) as AppAssetsResponse;
}
