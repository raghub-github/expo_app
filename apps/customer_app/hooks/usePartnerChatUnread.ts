import { useQuery } from "@tanstack/react-query";
import { orderPartnerChatService } from "@/services/orderPartnerChat.service";

const POLL_MS = 30_000;

export function partnerChatUnreadQueryKey(orderId: string) {
  return ["order-partner-chat-unread", orderId] as const;
}

export function usePartnerChatUnread(orderId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: partnerChatUnreadQueryKey(orderId ?? ""),
    queryFn: () => orderPartnerChatService.getUnreadCount(orderId!),
    enabled: Boolean(orderId) && enabled,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 20_000,
  });
}
