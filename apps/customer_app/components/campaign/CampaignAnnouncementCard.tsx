import { Pressable, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { AnnouncementCountdownLabel } from "@/components/campaign/AnnouncementCountdownLabel";
import type { AnnouncementCampaignPayload } from "@/lib/announcementCampaign";

const TEAL = "#14b8a6";
const TEAL_DARK = "#042f2e";

type Props = {
  campaign: AnnouncementCampaignPayload;
  onClose: () => void;
  onCta: () => void;
  onOpenTarget: () => void;
};

export function CampaignAnnouncementCard({ campaign, onClose, onCta, onOpenTarget }: Props) {
  const cta = campaign.ctaLabel;
  const showCountdown = campaign.countdownEnabled;

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable style={styles.card} onPress={() => {}}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.logoMark}>
              <AppText style={styles.logoLetter}>G</AppText>
            </View>
            <AppText style={styles.brand}>
              GatiMitra
              <AppText style={styles.dot}>  · now</AppText>
            </AppText>
          </View>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <AppText style={styles.closeX}>×</AppText>
          </Pressable>
        </View>

        <Pressable onPress={onOpenTarget}>
          {campaign.title ? <AppText style={styles.title}>{campaign.title}</AppText> : null}
          {campaign.body ? <AppText style={styles.body}>{campaign.body}</AppText> : null}
          {campaign.imageUrl ? (
            <Image
              source={{ uri: campaign.imageUrl }}
              style={styles.image}
              contentFit="cover"
            />
          ) : null}
        </Pressable>

        {cta || showCountdown ? (
          <View style={styles.actions}>
            {cta ? (
              <Pressable style={styles.cta} onPress={onCta} accessibilityRole="button">
                <AppText style={styles.ctaText} numberOfLines={1}>
                  {cta}
                </AppText>
                <AppText style={styles.ctaChevron}>›</AppText>
              </Pressable>
            ) : null}
            {showCountdown ? (
              <View style={[styles.countPill, !cta && styles.countPillGrow]}>
                <View style={styles.clockDot}>
                  <AppText style={styles.clockGlyph}>⏱</AppText>
                </View>
                <View>
                  <AppText style={styles.countCaption}>Offer valid for</AppText>
                  <AnnouncementCountdownLabel
                    remainingAtSyncMs={campaign.remainingAtSyncMs}
                    syncedAtPerf={campaign.syncedAtPerf}
                    style={styles.countValue}
                  />
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: "#121212",
    borderRadius: 22,
    overflow: "hidden",
    paddingBottom: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  logoLetter: { color: "#fff", fontWeight: "800", fontSize: 14 },
  brand: { color: "#fff", fontWeight: "700", fontSize: 13 },
  dot: { color: "#94a3b8", fontWeight: "400" },
  closeX: { color: "#94a3b8", fontSize: 22, lineHeight: 22 },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  body: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
  },
  image: {
    marginHorizontal: 12,
    height: 160,
    borderRadius: 16,
    backgroundColor: "#1e293b",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  cta: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: TEAL,
    borderRadius: 999,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  ctaText: { color: TEAL_DARK, fontWeight: "800", fontSize: 14, flex: 1 },
  ctaChevron: { color: TEAL_DARK, fontSize: 18, fontWeight: "700", marginLeft: 8 },
  countPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0f172a",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  countPillGrow: { flex: 1 },
  clockDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(20,184,166,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  clockGlyph: { fontSize: 11 },
  countCaption: { color: "#94a3b8", fontSize: 10 },
  countValue: { color: TEAL, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
});
