/**
 * Terminal order card — delivered / rejected / RTO history layout (light GatiMitra theme).
 */

import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant } from "@/constants/theme";
import type { OrderRecord, OrderStage } from "@/hooks/useOrders";
import {
  formatOrderDateTime,
  splitRejectionMessage,
} from "@/components/order/orderFormatters";
import { MerchantOrderCardLayout } from "@/components/order/MerchantOrderCardLayout";
import { merchantOrderCardLayoutStyles as styles } from "@/components/order/merchantOrderCardLayoutStyles";
import { formatTerminalOrderFooter } from "@/lib/terminalOrderFooter";

type Props = {
  order: OrderRecord;
  storeName?: string | null;
  rejectedReason?: string | null;
  vegOnly?: boolean;
  onPress: () => void;
};

function StatusBadge({
  label,
  backgroundColor,
  color,
  borderColor,
}: {
  label: string;
  backgroundColor: string;
  color: string;
  borderColor: string;
}) {
  return (
    <View style={[badgeStyles.badge, { backgroundColor, borderColor }]}>
      <Text style={[badgeStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

function VegOnlyBadge() {
  return (
    <View style={badgeStyles.vegBadge}>
      <View style={badgeStyles.vegDot} />
      <Text style={badgeStyles.vegText}>VEG ONLY</Text>
    </View>
  );
}

function statusMeta(status: OrderStage) {
  if (status === "rejected") {
    return {
      label: "REJECTED",
      badgeBg: "#FEE2E2",
      badgeText: "#B91C1C",
      badgeBorder: "#FECACA",
      prefixColor: "#DC2626",
      kind: "rejected" as const,
    };
  }
  if (status === "rto") {
    return {
      label: "RTO",
      badgeBg: "#FFEDD5",
      badgeText: "#C2410C",
      badgeBorder: "#FED7AA",
      prefixColor: "#EA580C",
      kind: "rto" as const,
    };
  }
  return {
    label: "DELIVERED",
    badgeBg: GatiMitraMerchant.statusCompletedBg,
    badgeText: GatiMitraMerchant.statusCompleted,
    badgeBorder: "#BBF7D0",
    prefixColor: GatiMitraMerchant.statusCompleted,
    kind: "delivered" as const,
  };
}

function TerminalOrderFooter({
  text,
  tone,
}: {
  text: string;
  tone: "success" | "neutral";
}) {
  const color =
    tone === "success" ? GatiMitraMerchant.statusCompleted : GatiMitraMerchant.textSecondary;
  return (
    <View style={styles.terminalFooterStatus}>
      <Ionicons name="time-outline" size={15} color={color} />
      <Text style={[styles.terminalFooterText, { color }]}>{text}</Text>
    </View>
  );
}

export function TerminalOrderCard({
  order,
  storeName,
  rejectedReason,
  vegOnly = false,
  onPress,
}: Props) {
  const meta = statusMeta(order.status);
  const isTerminalRejected = order.status === "rejected" || order.status === "rto";
  const dateIso =
    isTerminalRejected && order.cancelledAt ? order.cancelledAt : order.createdAt;
  const placedAt = formatOrderDateTime(dateIso);
  const footerMeta = formatTerminalOrderFooter(order);

  const rejection =
    meta.kind === "delivered"
      ? null
      : splitRejectionMessage(
          rejectedReason,
          meta.kind,
          order.cancelledByLabel,
          order.cancelledByType
        );

  const statusBadge = (
    <>
      <StatusBadge
        label={meta.label}
        backgroundColor={meta.badgeBg}
        color={meta.badgeText}
        borderColor={meta.badgeBorder}
      />
      {vegOnly ? <VegOnlyBadge /> : null}
    </>
  );

  const footer = (
    <>
      {footerMeta ? (
        <TerminalOrderFooter text={footerMeta.text} tone={footerMeta.tone} />
      ) : meta.kind === "delivered" ? (
        <TerminalOrderFooter text="Order completed successfully" tone="success" />
      ) : rejection ? (
        <Text style={styles.terminalReasonText} numberOfLines={4}>
          <Text style={[styles.terminalReasonPrefix, { color: meta.prefixColor }]}>
            {rejection.detail && !rejection.prefix.endsWith(":")
              ? `${rejection.prefix} - ${rejection.detail}`
              : rejection.prefix}
            {rejection.detail && rejection.prefix.endsWith(":") ? " " : ""}
          </Text>
          {rejection.detail && rejection.prefix.endsWith(":") ? (
            <Text>{rejection.detail}</Text>
          ) : null}
        </Text>
      ) : null}
    </>
  );

  return (
    <MerchantOrderCardLayout
      order={order}
      storeName={storeName}
      placedAt={placedAt}
      onViewDetail={onPress}
      showToolbar
      showRider={false}
      showInstructions={false}
      detailsDefaultOpen={false}
      statusBadge={statusBadge}
      footer={footer}
    />
  );
}

const badgeStyles = {
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
  },
  text: {
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 0.6,
  },
  vegBadge: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  vegDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#16A34A",
  },
  vegText: {
    fontSize: 10,
    fontWeight: "800" as const,
    letterSpacing: 0.4,
    color: "#166534",
  },
};
