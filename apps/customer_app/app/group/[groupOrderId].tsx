/**
 * Group order screen – participants, each user's items, Add items, Invite friends, Share.
 * MAX 30 members. Live-updating totals. Shareable link: gatimitra.app/group/{groupOrderId}
 */

import { useState } from "react";
import { AppText } from "@/components/AppText";

import { View, TouchableOpacity, StyleSheet, ScrollView, Share, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useLocationStore } from "@/store/locationStore";
import { useProfile } from "@/hooks/useProfile";
import { useStoreStatusStore } from "@/store/storeStatusStore";
import { useEnsureStoreLiveStatus } from "@/hooks/useEnsureStoreLiveStatus";

const APP_DOMAIN = "gatimitra.app";
const MAX_GROUP_MEMBERS = 30;

export default function GroupOrderScreen() {
  const { groupOrderId, storeId, storeName } = useLocalSearchParams<{
    groupOrderId: string;
    storeId: string;
    storeName: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const address = useLocationStore((s) => s.address);
  const profile = useProfile().data;
  const displayName = profile?.full_name?.trim() || profile?.mobile_number || "You";

  useEnsureStoreLiveStatus(storeId ?? null);
  const storeStatus = useStoreStatusStore((s) => (storeId ? (s.statusMap[storeId] ?? null) : null));
  const isStoreClosed = storeStatus === "CLOSED";

  const [timerMinsLeft, setTimerMinsLeft] = useState(30);
  const [memberCount] = useState(1);
  const [participants] = useState([{ id: "1", name: displayName, isYou: true, itemCount: 0 }]);
  const shareUrl = `https://${APP_DOMAIN}/group/${groupOrderId ?? ""}`;
  const atMemberLimit = memberCount >= MAX_GROUP_MEMBERS;

  const handleShare = async () => {
    if (atMemberLimit) {
      Alert.alert("Group limit reached", "This group order has reached the maximum of 30 members.");
      return;
    }
    try {
      await Share.share({
        message: `Join my group order: ${storeName}. Add your items! ${shareUrl}`,
        url: shareUrl,
        title: "Group order invite",
      });
    } catch {
      Alert.alert("Share", "Could not open share sheet.");
    }
  };

  const handleAddItems = () => {
    if (isStoreClosed) return;
    if (storeId) router.push(`/home/merchant/${storeId}`);
  };

  if (!groupOrderId) {
    return (
      <View style={styles.center}>
        <AppText style={styles.errorText}>Invalid group order</AppText>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <AppText style={styles.backBtnText}>Go back</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraColors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <AppText style={styles.headerTitle} numberOfLines={1}>
            {displayName}'s group order
          </AppText>
          <AppText style={styles.headerSub} numberOfLines={1}>
            From {storeName ?? "Restaurant"}
          </AppText>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.timerPill, isStoreClosed && styles.timerPillClosed]}>
            <AppText style={styles.timerText}>
              {isStoreClosed ? "CLOSED" : `${timerMinsLeft} mins left`}
            </AppText>
          </View>
          <View style={styles.memberCountWrap}>
            <AppText style={styles.memberCountText}>{memberCount} / {MAX_GROUP_MEMBERS}</AppText>
            <AppText style={styles.memberCountSub}>members</AppText>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={() => {}}>
            <Ionicons name="people" size={22} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => {}}>
            <Ionicons name="ellipsis-vertical" size={20} color={GatiMitraColors.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Participants / You */}
        <View style={styles.participantRow}>
          <View style={styles.avatar}>
            <AppText style={styles.avatarText}>{(displayName[0] ?? "Y").toUpperCase()}</AppText>
          </View>
          <View style={styles.participantInfo}>
            <AppText style={styles.participantName}>{displayName} (You)</AppText>
            <AppText style={styles.participantMeta}>Just you</AppText>
          </View>
        </View>

        {/* Delivery card */}
        <View style={styles.card}>
          <Ionicons name="location" size={20} color={GatiMitraColors.emerald} />
          <View style={styles.cardText}>
            <AppText style={styles.cardLabel}>Delivery at your location</AppText>
            <AppText style={styles.cardAddress} numberOfLines={2}>
              {address?.fullAddress ?? address?.primary ?? "Select address"}
            </AppText>
          </View>
        </View>

        {/* Your contribution */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.avatarSmall}>
              <AppText style={styles.avatarTextSmall}>{(displayName[0] ?? "Y").toUpperCase()}</AppText>
            </View>
            <View style={styles.cardText}>
              <AppText style={styles.participantName}>{displayName} (You)</AppText>
              <AppText style={styles.participantMeta}>No items added</AppText>
            </View>
            <TouchableOpacity
              onPress={handleAddItems}
              style={[styles.addItemsBtn, isStoreClosed && styles.addItemsBtnDisabled]}
              disabled={isStoreClosed}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <AppText style={styles.addItemsBtnText}>
                {isStoreClosed ? "Store closed" : "Add items"}
              </AppText>
            </TouchableOpacity>
          </View>
        </View>

        {/* Invite friends */}
        <TouchableOpacity
          style={[styles.inviteCard, atMemberLimit && styles.inviteCardDisabled]}
          onPress={handleShare}
          activeOpacity={0.9}
          disabled={atMemberLimit}
        >
          <View style={styles.inviteLeft}>
            <Ionicons name="people" size={24} color={atMemberLimit ? "#9ca3af" : GatiMitraColors.emerald} />
            <AppText style={[styles.inviteText, atMemberLimit && styles.inviteTextDisabled]}>
              {atMemberLimit ? "Group limit reached (30 members max)" : "Invite friends to join your group order"}
            </AppText>
          </View>
          <LinearGradient
            colors={atMemberLimit ? ["#9ca3af", "#6b7280"] : [GatiMitraColors.deepMintStart, GatiMitraColors.deepMintEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.shareBtn, atMemberLimit && styles.shareBtnDisabled]}
          >
            <Ionicons name="share" size={20} color="#fff" />
            <AppText style={styles.shareBtnText}>Share</AppText>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraColors.softBackground },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorText: { fontSize: 16, color: GatiMitraColors.textSecondary },
  backBtn: { marginTop: 16, paddingVertical: 10, paddingHorizontal: 20 },
  backBtnText: { fontSize: 16, fontWeight: "600", color: GatiMitraColors.emerald },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerBack: { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraColors.textPrimary },
  headerSub: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  timerPill: {
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  timerPillClosed: { backgroundColor: GatiMitraColors.closedRed },
  timerText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  memberCountWrap: { alignItems: "center" },
  memberCountText: { fontSize: 12, fontWeight: "700", color: GatiMitraColors.textPrimary },
  memberCountSub: { fontSize: 10, color: GatiMitraColors.textSecondary },
  iconBtn: { padding: 6 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "700", color: GatiMitraColors.emerald },
  avatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTextSmall: { fontSize: 14, fontWeight: "700", color: GatiMitraColors.emerald },
  participantInfo: { marginLeft: 14, flex: 1 },
  participantName: { fontSize: 16, fontWeight: "600", color: GatiMitraColors.textPrimary },
  participantMeta: { fontSize: 13, color: GatiMitraColors.textSecondary, marginTop: 2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  cardRow: { flexDirection: "row", alignItems: "center", flex: 1 },
  cardText: { flex: 1, marginLeft: 14 },
  cardLabel: { fontSize: 12, color: GatiMitraColors.textSecondary, marginBottom: 2 },
  cardAddress: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary },
  addItemsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: GatiMitraColors.emerald,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addItemsBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  addItemsBtnDisabled: { backgroundColor: "#9ca3af", opacity: 0.9 },
  inviteCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#f3f4f6",
  },
  inviteCardDisabled: { opacity: 0.85 },
  inviteLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  inviteText: { fontSize: 15, fontWeight: "600", color: GatiMitraColors.textPrimary, flex: 1 },
  inviteTextDisabled: { color: GatiMitraColors.textSecondary },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  shareBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  shareBtnDisabled: { opacity: 0.8 },
});
