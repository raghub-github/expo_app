import api from "./api";

export async function getHiddenStoreIds(): Promise<string[]> {
  const { data } = await api.get<{ storeIds: string[] }>("/v1/hidden-stores");
  return Array.isArray(data?.storeIds) ? data.storeIds.map(String) : [];
}

export async function setHiddenStoreRemote(
  storeId: string,
  hidden: boolean
): Promise<{ hidden: boolean }> {
  const { data } = await api.post<{ hidden: boolean }>("/v1/hidden-stores", {
    storeId,
    hidden,
  });
  return { hidden: data?.hidden === true };
}
