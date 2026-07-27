import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Pressable } from "react-native";
import { OFFERS_UI } from "./offers-theme";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";

type PageTab = "create" | "track";

type Props = {
  active: PageTab;
  trackCount: number;
  onChange: (tab: PageTab) => void;
};

export function OffersPageTabs({ active, trackCount, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.segment}>
        <Pressable
          onPress={() => onChange("create")}
          style={[styles.segmentBtn, active === "create" && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, active === "create" && styles.segmentTextActive]}>
            Create offers
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onChange("track")}
          style={[styles.segmentBtn, active === "track" && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentText, active === "track" && styles.segmentTextActive]}>
            Track offers
          </Text>
          {trackCount > 0 ? (
            <View style={[styles.badge, active === "track" && styles.badgeActive]}>
              <Text style={[styles.badgeText, active === "track" && styles.badgeTextActive]}>
                {trackCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: OFFERS_UI.pageBg,
    borderBottomWidth: 1,
    borderBottomColor: OFFERS_UI.cardBorder,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: "#fff",
    ...GatiMitraMerchant.shadowSm,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: OFFERS_UI.textMuted,
  },
  segmentTextActive: {
    color: OFFERS_UI.text,
    fontWeight: "700",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeActive: { backgroundColor: OFFERS_UI.accentSoft },
  badgeText: { fontSize: 10, fontWeight: "800", color: OFFERS_UI.textMuted },
  badgeTextActive: { color: OFFERS_UI.accent },
});
