/**
 * Merchant service - list nearby merchants, get merchant detail and menu.
 */

import api from "./api";

const MERCHANTS_PREFIX = "/v1/merchants";

export type MerchantSummary = {
  id: string;
  name: string;
  imageUrl?: string;
  rating?: number;
  deliveryTime?: string;
  cuisines?: string[];
  costForTwo?: number;
  isOpen?: boolean;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isVeg: boolean;
  category?: string;
};

export type MerchantDetail = MerchantSummary & {
  menu: MenuItem[];
  address?: string;
};

export const merchantService = {
  async getMerchants(params?: { lat?: number; lng?: number; limit?: number }): Promise<MerchantSummary[]> {
    const { data } = await api.get<MerchantSummary[]>(MERCHANTS_PREFIX, { params });
    return data;
  },

  async getMerchantById(id: string): Promise<MerchantDetail> {
    const { data } = await api.get<MerchantDetail>(`${MERCHANTS_PREFIX}/${id}/menu`);
    return data;
  },
};
