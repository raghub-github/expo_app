/**
 * Zomato-style one-time address share links.
 */

import api from "./api";
import type { Address } from "./address.service";

export type AddressShareLinkResponse = {
  token: string;
  shortCode: string;
  url: string;
  expiresAt: string;
  shareMessage: string;
  linkPreviewSupported?: boolean;
};

export type AddressShareClaimResponse = {
  ok: true;
  addressId: number;
  fullAddress: string;
  latitude: number;
  longitude: number;
  label: string | null;
};

export const addressShareService = {
  async createShareLink(addressId: number): Promise<AddressShareLinkResponse> {
    const { data } = await api.post<AddressShareLinkResponse>(
      `/v1/me/addresses/${addressId}/share-link`
    );
    return data;
  },

  async claimShareLink(token: string): Promise<AddressShareClaimResponse> {
    const { data } = await api.post<AddressShareClaimResponse>("/v1/me/address-share/claim", {
      token,
    });
    return data;
  },
};

/** Share an address via the system share sheet (WhatsApp, etc.). */
export async function shareAddressViaLink(addr: Address): Promise<void> {
  const { Share } = await import("react-native");
  const link = await addressShareService.createShareLink(addr.id);
  await Share.share({ message: link.shareMessage, url: link.url });
}
