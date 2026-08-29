import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant } from "@/constants/theme";
import { FeedbackImageRow } from "@/components/FeedbackImageRow";
import { FeedbackCustomerAvatar } from "@/components/FeedbackCustomerAvatar";
import { parseMerchantReviewReplies, type MerchantReviewReply } from "@/lib/merchantReviewReplies";

export type FeedbackCardItem = {
  id: number;
  overallRating: number;
  reviewTitle: string | null;
  reviewText: string | null;
  createdAt: string;
  replyText?: string | null;
  repliedAt?: string | null;
  replies?: MerchantReviewReply[] | null;
  customerName?: string | null;
  customerAvatarUrl?: string | null;
  formattedOrderId?: string | null;
  orderCount?: number | null;
  reviewImages?: string[] | null;
  source?: "rating" | "ticket";
  ticketStatus?: string | null;
};

function ratingBadgeColor(rating: number): string {
  if (rating >= 4) return "#16A34A";
  if (rating >= 3) return "#CA8A04";
  if (rating >= 2) return "#EA580C";
  return "#E4572E";
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", { day: "numeric", timeZone: "Asia/Kolkata" });
  const month = d.toLocaleDateString("en-GB", { month: "short", timeZone: "Asia/Kolkata" });
  const year = d.toLocaleDateString("en-GB", { year: "numeric", timeZone: "Asia/Kolkata" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
  return `${day} ${month}, ${year} ${time}`;
}

function orderHeaderLabel(formattedOrderId?: string | null): string {
  const raw = (formattedOrderId ?? "").trim();
  if (!raw) return "Order";
  if (/^order\b/i.test(raw)) return raw;
  return raw.startsWith("#") ? `Order ${raw}` : `Order #${raw.replace(/^#/, "")}`;
}

function firstName(name?: string | null): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "Customer";
  return trimmed.split(/\s+/)[0] ?? "Customer";
}

function ordersWithYou(count?: number | null): string {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return "Customer";
  return n === 1 ? "1 order with you" : `${n} orders with you`;
}

export function FeedbackCard({
  item,
  token,
  storeHeading,
  onReply,
  showStatus = false,
}: {
  item: FeedbackCardItem;
  token?: string | null;
  storeHeading: string;
  onReply?: () => void;
  showStatus?: boolean;
}) {
  const isTicket = item.source === "ticket";
  const body = (item.reviewText || item.reviewTitle || "").trim();
  const rounded = Math.round(Number(item.overallRating) || 0);
  const replies = parseMerchantReviewReplies(item.replies, item.replyText, item.repliedAt ?? item.createdAt);
  const replyCount = replies.length;
  const replied = replyCount > 0;
  const customerName = item.customerName?.trim() || "Customer";
  const header = `${orderHeaderLabel(item.formattedOrderId)} • ${storeHeading}`;
  const statusRaw = String(item.ticketStatus ?? "").toUpperCase();
  const isClosed =
    statusRaw.includes("RESOLVE") ||
    statusRaw.includes("CLOSE") ||
    (!isTicket && replied);
  const hasImages = (item.reviewImages ?? []).some((u) => String(u).trim());
  const openThread = !isTicket ? onReply : undefined;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={openThread}
        disabled={!openThread}
        style={({ pressed }) => [styles.orderRow, pressed && openThread ? styles.pressed : null]}
        accessibilityRole={openThread ? "button" : undefined}
        accessibilityLabel="Open reply"
        hitSlop={8}
      >
        <Text style={styles.orderMeta} numberOfLines={1}>
          {header}
        </Text>
        {openThread ? (
          <Pressable
            onPress={openThread}
            hitSlop={12}
            style={({ pressed }) => [styles.chevronHit, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Open reply page"
          >
            <Ionicons name="chevron-forward" size={16} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
        ) : null}
      </Pressable>

      <View style={styles.profileRow}>
        <FeedbackCustomerAvatar
          uri={item.customerAvatarUrl}
          name={customerName}
          token={token}
          size={36}
        />
        <View style={styles.profileText}>
          <View style={styles.profileNameRow}>
            <Text style={styles.customerName} numberOfLines={1}>
              {firstName(customerName)}
            </Text>
            {showStatus ? (
              <View style={[styles.statusBadge, isClosed ? styles.statusClosed : styles.statusOpen]}>
                <Text style={styles.statusBadgeText}>{isClosed ? "CLOSED" : "OPEN"}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.ordersMeta} numberOfLines={1}>
            {ordersWithYou(item.orderCount)}
          </Text>
        </View>
      </View>

      <View style={styles.bubble}>
        <View style={[styles.bubbleTop, body || hasImages ? styles.bubbleTopSpaced : null]}>
          {rounded > 0 ? (
            <View style={[styles.ratingBadge, { backgroundColor: ratingBadgeColor(rounded) }]}>
              <Text style={styles.ratingBadgeText}>{rounded}</Text>
              <Ionicons name="star" size={10} color="#FFFFFF" />
            </View>
          ) : null}
          <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
        </View>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        <FeedbackImageRow urls={item.reviewImages} token={token} />
        <View style={styles.actions}>
          {replyCount > 0 ? (
            <View style={styles.replyCount}>
              <Ionicons name="chatbubble-outline" size={15} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.replyCountText}>{replyCount}</Text>
            </View>
          ) : (
            <View />
          )}
          {!isTicket && onReply ? (
            <Pressable
              onPress={onReply}
              style={({ pressed }) => [styles.replyBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Reply"
            >
              <Ionicons name="arrow-undo-outline" size={15} color={REPLY_BLUE} />
              <Text style={styles.replyLabel}>Reply</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const REPLY_BLUE = "#2563EB";

const styles = StyleSheet.create({
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  orderMeta: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  statusBadge: {
    flexShrink: 0,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusOpen: {
    backgroundColor: "#FDBA74",
  },
  statusClosed: {
    backgroundColor: GatiMitraMerchant.success,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.3,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  profileText: { flex: 1, minWidth: 0 },
  profileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  ordersMeta: {
    marginTop: 1,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  bubble: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  bubbleTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  bubbleTopSpaced: {
    marginBottom: 8,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  ratingBadgeText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  when: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: GatiMitraMerchant.textTertiary,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    color: GatiMitraMerchant.textPrimary,
  },
  actions: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  replyCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  replyCountText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  chevronHit: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  replyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  replyLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: REPLY_BLUE,
  },
  pressed: { opacity: 0.72 },
});
