import { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { MerchantOrderIdRow } from "@/components/order/MerchantOrderCardToolbar";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";
import type { OrderRecord } from "@/hooks/useOrders";
import type { MerchantHelpSection } from "@/services/ticketApi";
import { LIVE_ORDER_SUPPORT_TITLE } from "@/lib/liveOrderSupport";
import { useLiveOrderSupportTopics } from "@/hooks/useLiveOrderSupportTopics";

type Props = {
  visible: boolean;
  order: OrderRecord;
  onClose: () => void;
  /** Called when user completes flow and opens support chat. */
  onFinished?: () => void;
};

function resolveHelpIcon(fromDb: string | null): keyof typeof Ionicons.glyphMap {
  if (fromDb && fromDb in Ionicons.glyphMap) {
    return fromDb as keyof typeof Ionicons.glyphMap;
  }
  return "help-circle-outline";
}

export function LiveOrderSupportSheet({ visible, order, onClose, onFinished }: Props) {
  const router = useRouter();
  const { data: topics = [], isLoading, isFetching, error } = useLiveOrderSupportTopics(visible);

  const foodId = /^\d+$/.test(order.id) ? order.id : "";
  const formattedId = formatOrderIdDisplay(
    order.formattedOrderId,
    order.ordersCoreId,
    foodId ? Number(foodId) : undefined
  );
  const formattedOrderIdBody = formattedId.replace(/^#?/i, "");

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const openChat = useCallback(
    (topic: MerchantHelpSection) => {
      onClose();
      onFinished?.();
      router.push({
        pathname: "/support/chat/[ticketId]",
        params: {
          ticketId: "new",
          sectionId: topic.sectionId,
          sectionTitle: topic.title,
          ticketTitleId: String(topic.ticketTitleId),
          orderCoreId: String(order.ordersCoreId),
          ...(foodId ? { ordersFoodId: foodId } : {}),
          formattedOrderId: formattedOrderIdBody,
          fromLiveOrderSupport: "1",
          ...(topic.quickOptions.length > 0
            ? { quickOptionsJson: JSON.stringify(topic.quickOptions) }
            : {}),
        },
      });
    },
    [onClose, onFinished, router, order.ordersCoreId, foodId, formattedOrderIdBody]
  );

  const loadError =
    error instanceof Error
      ? error.message
      : !isLoading && topics.length === 0
        ? "No order support topics are configured yet."
        : null;

  const showSpinner = isLoading && topics.length === 0;

  return (
    <MerchantBottomSheetShell
      visible={visible}
      onClose={handleClose}
      maxHeightPercent="72%"
    >
      <LinearGradient
        colors={[...GatiMitraMerchant.primaryGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View style={styles.liveBadge}>
            <View style={styles.liveBadgeDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.heroTitle}>{LIVE_ORDER_SUPPORT_TITLE}</Text>
        <Text style={styles.heroSubtitle} numberOfLines={2}>
          Select the issue for this order — our team responds quickly
        </Text>
        <View style={styles.orderChip}>
          <Ionicons name="receipt-outline" size={14} color={GatiMitraMerchant.primaryDark} />
          <MerchantOrderIdRow
            formattedOrderId={order.formattedOrderId}
            fallbackOrderId={order.ordersCoreId}
          />
        </View>
      </LinearGradient>

      {showSpinner ? (
        <View style={styles.center}>
          <ActivityIndicator color={GatiMitraMerchant.primary} />
          <Text style={styles.loadingHint}>Loading support options…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={28} color={GatiMitraMerchant.textTertiary} />
          <Text style={styles.errorText}>{loadError}</Text>
          {isFetching ? (
            <ActivityIndicator color={GatiMitraMerchant.primary} style={{ marginTop: 8 }} />
          ) : null}
        </View>
      ) : (
        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {topics.map((topic, index) => (
            <Pressable
              key={String(topic.ticketTitleId)}
              onPress={() => openChat(topic)}
              style={({ pressed }) => [styles.topicCard, pressed && styles.cardPressed]}
            >
              <View style={[styles.topicIconWrap, index % 2 === 0 ? styles.topicIconA : styles.topicIconB]}>
                <Ionicons
                  name={resolveHelpIcon(topic.helpHubIcon)}
                  size={22}
                  color={index % 2 === 0 ? GatiMitraMerchant.primaryDark : "#E85D04"}
                />
              </View>
              <View style={styles.topicBody}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                {topic.subtitle ? (
                  <Text style={styles.topicSubtitle} numberOfLines={2}>
                    {topic.subtitle}
                  </Text>
                ) : null}
              </View>
              <View style={styles.chevronWrap}>
                <Ionicons name="chevron-forward" size={16} color={GatiMitraMerchant.primary} />
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: H_PADDING,
    paddingTop: 4,
    paddingBottom: 16,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  liveBadgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#BBF7D0",
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#FFFFFF",
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 18,
  },
  orderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  center: {
    paddingVertical: 32,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  loadingHint: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
  },
  errorText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingHorizontal: H_PADDING,
    marginTop: 4,
  },
  list: {
    flexGrow: 0,
    maxHeight: 340,
  },
  listContent: {
    paddingTop: 14,
    paddingHorizontal: H_PADDING,
    paddingBottom: 4,
    gap: 10,
  },
  topicCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EEF2F6",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  topicIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  topicIconA: { backgroundColor: "#E8F8F1" },
  topicIconB: { backgroundColor: "#FFF0E8" },
  topicBody: { flex: 1, minWidth: 0, gap: 3 },
  topicTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  topicSubtitle: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 16,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
});
