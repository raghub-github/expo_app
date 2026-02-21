/**
 * Order service - create order, get order details, list history.
 */

import api from "./api";

const ORDERS_PREFIX = "/v1/orders";

export type OrderSummary = {
  orderId: string;
  status: string;
  merchantName?: string;
  totalAmount?: number;
  createdAt: string;
  items?: { name: string; quantity: number; price: number }[];
};

export type OrderDetail = OrderSummary & {
  statusHistory?: { status: string; at: string }[];
  rider?: { name: string; phone?: string };
  deliveryAddress?: string;
};

export const orderService = {
  async createOrder(payload: {
    merchantId: string;
    items: { menuItemId: string; quantity: number; price: number }[];
    addressId: string;
    paymentMethod: string;
  }): Promise<OrderDetail> {
    const { data } = await api.post<OrderDetail>(ORDERS_PREFIX, payload);
    return data;
  },

  async getOrder(orderId: string): Promise<OrderDetail> {
    const { data } = await api.get<OrderDetail>(`${ORDERS_PREFIX}/${orderId}`);
    return data;
  },

  async getMyOrders(params?: { limit?: number; offset?: number }): Promise<OrderSummary[]> {
    const { data } = await api.get<OrderSummary[]>(ORDERS_PREFIX, { params });
    return data;
  },
};
