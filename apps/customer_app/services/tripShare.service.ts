import api from "./api";

const ORDERS_PREFIX = "/v1/orders";

export type TripShareLinkResponse = {
  token: string;
  url: string;
  expiresAt: string;
  shareMessage: string;
};

export async function createTripShareLink(orderId: string): Promise<TripShareLinkResponse> {
  const { data } = await api.post<TripShareLinkResponse>(`${ORDERS_PREFIX}/${encodeURIComponent(orderId)}/share-link`);
  return data;
}
