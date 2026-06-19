import { getRiderAppConfig } from "@/src/config/env";
import { getJson, postJson } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";

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
};

function authHeaders() {
  const token = useSessionStore.getState().session?.accessToken;
  if (!token) throw new Error("Not authenticated");
  return { authorization: `Bearer ${token}` };
}

function apiPrefix() {
  return `${getRiderAppConfig().apiBaseUrl}/v1/rider`;
}

export const orderPartnerChatService = {
  async getUnreadCount(orderId: string): Promise<OrderPartnerChatUnreadResponse> {
    return getJson<OrderPartnerChatUnreadResponse>(
      `${apiPrefix()}/orders/${encodeURIComponent(orderId)}/partner-chat/unread`,
      { headers: authHeaders() }
    );
  },

  async listMessages(orderId: string, since?: string): Promise<OrderPartnerChatListResponse> {
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    return getJson<OrderPartnerChatListResponse>(
      `${apiPrefix()}/orders/${encodeURIComponent(orderId)}/partner-chat/messages${qs}`,
      { headers: authHeaders() }
    );
  },

  async sendMessage(orderId: string, body: string): Promise<OrderPartnerChatMessage> {
    return postJson<OrderPartnerChatMessage>(
      `${apiPrefix()}/orders/${encodeURIComponent(orderId)}/partner-chat/messages`,
      { body },
      { headers: authHeaders() }
    );
  },
};
