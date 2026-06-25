import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import type { ChatSharedLocation } from "@/src/lib/parse-chat-shared-location";
import { openGoogleMapsNavigation } from "@/src/lib/open-google-maps-navigation";

const MINT = colors.primary[500];
const TEXT = "#1C1C1C";
const MUTED = "#828282";

type Props = {
  location: ChatSharedLocation;
  timeLabel: string;
};

export function CustomerSharedLocationChatBubble({ location, timeLabel }: Props) {
  const { t } = useTranslation();
  const [opening, setOpening] = useState(false);

  const handleOpenRoute = async () => {
    if (opening) return;
    setOpening(true);
    try {
      await openGoogleMapsNavigation({
        destination: { lat: location.lat, lng: location.lng },
        destinationLabel: location.label,
      });
    } finally {
      setOpening(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Ionicons name="location" size={18} color={MINT} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>
            {location.leadText ||
              t("orders.partnerChat.sharedLocationTitle", "Customer shared pickup location")}
          </Text>
          {location.label ? (
            <Text style={styles.address} numberOfLines={3}>
              {location.label}
            </Text>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        style={styles.navBtn}
        onPress={() => void handleOpenRoute()}
        disabled={opening}
        activeOpacity={0.88}
      >
        {opening ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="navigate" size={16} color="#fff" />
            <Text style={styles.navBtnText}>
              {t("orders.partnerChat.openRouteInMaps", "Open map Navigation")}
            </Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.timeLabel}>{timeLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", marginBottom: 10, maxWidth: "88%" },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  textCol: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 14, fontWeight: "700", color: TEXT, lineHeight: 20 },
  address: { fontSize: 13, color: MUTED, lineHeight: 18 },
  navBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    backgroundColor: MINT,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  navBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },
  timeLabel: { fontSize: 10, color: MUTED, marginTop: 4, marginLeft: 4 },
});
