import { useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, Platform, Vibration } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { RiderPickupChatCustomerView } from "@/lib/rider-pickup-chat-customer";

const MINT = GatiMitraColors.primaryMint;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;

type Props = {
  view: RiderPickupChatCustomerView;
  createdAt: string;
  timeLabel: string;
  onCall?: () => void;
  onChat?: () => void;
  onShareLocation?: () => void;
  shareLoading?: boolean;
};

function formatWaitingDuration(startIso: string): string {
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return "0:00";
  const sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RiderPickupChatCustomerCard({
  view,
  createdAt,
  timeLabel,
  onCall,
  onChat,
  onShareLocation,
  shareLoading = false,
}: Props) {
  const [waitLabel, setWaitLabel] = useState(() => formatWaitingDuration(createdAt));

  useEffect(() => {
    if (view.action !== "arrived_alert") return;
    if (Platform.OS === "android") {
      Vibration.vibrate([0, 400, 120, 400]);
    } else {
      Vibration.vibrate();
    }
  }, [view.action, createdAt]);

  useEffect(() => {
    if (view.action !== "waiting_timer") return;
    setWaitLabel(formatWaitingDuration(createdAt));
    const timer = setInterval(() => {
      setWaitLabel(formatWaitingDuration(createdAt));
    }, 1000);
    return () => clearInterval(timer);
  }, [view.action, createdAt]);

  const actionRow = useMemo(() => {
    if (view.action === "share_location") {
      return (
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={onShareLocation}
          disabled={shareLoading}
          activeOpacity={0.88}
        >
          <Ionicons name="location" size={16} color="#fff" />
          <AppText style={styles.primaryBtnText}>
            {shareLoading ? "Sharing…" : "Share live location"}
          </AppText>
        </TouchableOpacity>
      );
    }
    if (view.action === "help_actions") {
      return (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onCall} activeOpacity={0.88}>
            <Ionicons name="call" size={15} color={MINT} />
            <AppText style={styles.secondaryBtnText}>Call driver</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onChat} activeOpacity={0.88}>
            <Ionicons name="chatbubble-ellipses" size={15} color={MINT} />
            <AppText style={styles.secondaryBtnText}>Chat</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onShareLocation}
            disabled={shareLoading}
            activeOpacity={0.88}
          >
            <Ionicons name="location" size={15} color={MINT} />
            <AppText style={styles.secondaryBtnText}>Share location</AppText>
          </TouchableOpacity>
        </View>
      );
    }
    if (view.action === "call_highlight") {
      return (
        <TouchableOpacity style={styles.callHighlightBtn} onPress={onCall} activeOpacity={0.88}>
          <Ionicons name="call" size={18} color="#fff" />
          <AppText style={styles.primaryBtnText}>Call driver now</AppText>
        </TouchableOpacity>
      );
    }
    if (view.action === "waiting_timer") {
      return (
        <View style={styles.waitRow}>
          <Ionicons name="time-outline" size={16} color="#B45309" />
          <AppText style={styles.waitText}>Waiting {waitLabel}</AppText>
        </View>
      );
    }
    return null;
  }, [view.action, onCall, onChat, onShareLocation, shareLoading, waitLabel]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.card, view.action === "call_highlight" && styles.cardUrgent]}>
        {view.action === "arrived_alert" ? (
          <View style={styles.arrivedBadge}>
            <Ionicons name="notifications" size={14} color="#B45309" />
            <AppText style={styles.arrivedBadgeText}>Driver arrived</AppText>
          </View>
        ) : null}
        <AppText style={styles.body}>{view.customerText}</AppText>
        {actionRow}
      </View>
      <AppText style={styles.timeLabel}>{timeLabel}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", marginBottom: 10 },
  card: {
    maxWidth: "88%",
    backgroundColor: "#F0FDF4",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    gap: 10,
  },
  cardUrgent: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },
  arrivedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: "#FFFBEB",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  arrivedBadgeText: { fontSize: 11, fontWeight: "700", color: "#B45309" },
  body: { fontSize: 14, color: TEXT, lineHeight: 20, fontWeight: "600" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: MINT,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  callHighlightBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: GatiMitraColors.warmOrange,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  secondaryBtnText: { fontSize: 12, fontWeight: "700", color: MINT },
  waitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FFFBEB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  waitText: { fontSize: 13, fontWeight: "700", color: "#B45309" },
  timeLabel: { fontSize: 10, color: MUTED, marginTop: 4, marginLeft: 4 },
});
