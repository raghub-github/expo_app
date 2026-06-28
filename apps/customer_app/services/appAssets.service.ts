import api from "@/services/api";

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
  app: "customer";
  assets: Record<string, AppAssetItem>;
  items: AppAssetItem[];
};

export async function fetchCustomerAppAssets(): Promise<AppAssetsResponse> {
  const res = await api.get<AppAssetsResponse>("/v1/app-assets/customer", {
    headers: { "X-Silent-Error": "1" },
  });
  return res.data;
}
