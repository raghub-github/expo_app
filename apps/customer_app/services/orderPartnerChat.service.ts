import api from "./api";

export type OrderPartnerChatMessage = {
  id: number;
  senderType: "CUSTOMER" | "RIDER" | "SYSTEM";
  body: string;
  createdAt: string;
  isMine: boolean;
};

export type OrderPartnerChatListResponse = {
  messages: OrderPartnerChatMessage[];
  chatClosed: boolean;
};

export type OrderPartnerChatUnreadResponse = {
  unreadCount: number;
  chatClosed: boolean;
};

export const orderPartnerChatService = {
  async getUnreadCount(orderId: string): Promise<OrderPartnerChatUnreadResponse> {
    const { data } = await api.get<OrderPartnerChatUnreadResponse>(
      `/v1/orders/${encodeURIComponent(orderId)}/partner-chat/unread`
    );
    return data;
  },

  async listMessages(orderId: string, since?: string): Promise<OrderPartnerChatListResponse> {
    const params = since ? { since } : undefined;
    const { data } = await api.get<OrderPartnerChatListResponse>(
      `/v1/orders/${encodeURIComponent(orderId)}/partner-chat/messages`,
      { params }
    );
    return data;
  },

  async sendMessage(orderId: string, body: string): Promise<OrderPartnerChatMessage> {
    const { data } = await api.post<OrderPartnerChatMessage>(
      `/v1/orders/${encodeURIComponent(orderId)}/partner-chat/messages`,
      { body }
    );
    return data;
  },
};
