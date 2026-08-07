/**
 * Zomato-style one-time address share links.
 */

import api from "./api";
import type { Address } from "./address.service";
import { addressesRoughlyMatch } from "@/lib/addressGeo";

export type AddressSharePreview = {
  fullAddress: string;
  label: string | null;
  landmark: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  contactName: string | null;
  contactMobile: string | null;
};

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

type AddressSharePreviewResponse =
  | {
      ok: true;
      address: AddressSharePreview;
      expiresAt: string;
    }
  | { ok: false; error: string };

export const addressShareService = {
  async createShareLink(addressId: number): Promise<AddressShareLinkResponse> {
    const { data } = await api.post<AddressShareLinkResponse>(
      `/v1/me/addresses/${addressId}/share-link`
    );
    return data;
  },

  async getSharePreview(token: string): Promise<AddressSharePreview> {
    const { data } = await api.get<AddressSharePreviewResponse>(
      `/v1/public/address-share/${encodeURIComponent(token.trim())}/preview`
    );
    if (!data.ok) {
      throw Object.assign(new Error(data.error), { code: data.error });
    }
    return data.address;
  },

  async claimShareLink(token: string): Promise<AddressShareClaimResponse> {
    const { data } = await api.post<AddressShareClaimResponse>("/v1/me/address-share/claim", {
      token,
    });
    return data;
  },
};

/** True when the shared preview already exists in the user's saved addresses. */
export function isSharedAddressAlreadySaved(
  savedAddresses: Address[],
  preview: AddressSharePreview
): boolean {
  return savedAddresses.some((addr) =>
    addressesRoughlyMatch(
      { latitude: preview.latitude, longitude: preview.longitude, fullAddress: preview.fullAddress },
      { latitude: addr.latitude, longitude: addr.longitude, fullAddress: addr.fullAddress }
    )
  );
}

/** Share an address via the system share sheet (WhatsApp, etc.). */
export async function shareAddressViaLink(addr: Address): Promise<void> {
  const { Share } = await import("react-native");
  const link = await addressShareService.createShareLink(addr.id);
  await Share.share({ message: link.shareMessage, url: link.url });
}
