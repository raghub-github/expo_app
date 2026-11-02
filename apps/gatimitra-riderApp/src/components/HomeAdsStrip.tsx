import { useCallback, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchRiderHomeAds, type HomeAd } from "@/src/services/homeAdsApi";

type Props = { placement: "home" | "orders" };

const CARD_H = 128;
const GAP = 10;
const PEEK = 28;
const CARD_RADIUS = 16;
const CTA_RADIUS = 20;
const LORA = "Lora_400Regular";
const LORA_BOLD = "Lora_700Bold";
const TEAL = "#03C3B2";

function AdCard({
  ad,
  width,
  onCta,
}: {
  ad: HomeAd;
  width: number | `${number}%`;
  onCta: (ad: HomeAd) => void;
}) {
  return (
    <View style={[styles.card, { width, height: CARD_H }]}>
      {ad.imageUrl ? (
        <Image source={{ uri: ad.imageUrl }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.image, styles.fallback]} />
      )}
      <LinearGradient
        colors={["rgba(55,12,18,0.92)", "rgba(55,12,18,0.55)", "rgba(55,12,18,0.08)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradient}
      />
      <View style={styles.copy} pointerEvents="box-none">
        {ad.title || ad.body ? (
          <Text style={styles.promo} numberOfLines={3}>
            {ad.title ? <Text style={styles.title}>{ad.title.trim()}</Text> : null}
            {ad.title && ad.body ? " " : null}
            {ad.body ? <Text style={styles.body}>{ad.body.trim()}</Text> : null}
          </Text>
        ) : null}
        {ad.ctaLabel ? (
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={() => onCta(ad)}
            accessibilityRole="button"
            hitSlop={8}
          >
            <Text style={styles.ctaText}>{ad.ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function HomeAdsStrip({ placement }: Props) {
  const router = useRouter();
  const [ads, setAds] = useState<HomeAd[]>([]);
  const [sheetAd, setSheetAd] = useState<HomeAd | null>(null);
  const [trackW, setTrackW] = useState(0);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0) setTrackW((prev) => (prev === w ? prev : w));
  }, []);

  const load = useCallback(async () => {
    try {
      setAds(await fetchRiderHomeAds(placement));
    } catch {
      /* keep */
    }
  }, [placement]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onCta = useCallback(
    async (ad: HomeAd) => {
      const action = String(ad.ctaAction ?? "").toLowerCase();
      const url = (ad.ctaUrl ?? "").trim();
      if (action === "bottom_sheet") {
        setSheetAd(ad);
        return;
      }
      const inAppPath = url.startsWith("/") || /^gatimitra:\/\//i.test(url);
      if (action === "redirect" || (url && action !== "share") || inAppPath) {
        if (!url) return;
        if (/^https?:\/\//i.test(url)) {
          await Linking.openURL(url).catch(() => {});
          return;
        }
        const href = url.startsWith("/") ? url : `/${url}`;
        try {
          router.push(href as never);
        } catch {
          await Linking.openURL(url).catch(() => {});
        }
        return;
      }
      if (action === "share") {
        const message = [ad.title, ad.body, url].filter(Boolean).join("\n");
        if (!message) return;
        try {
          await Share.share({ message, url: url || undefined, title: ad.title || "Share" });
        } catch {
          if (url) void Linking.openURL(url).catch(() => {});
        }
      }
    },
    [router]
  );

  if (ads.length === 0) return null;

  const multi = ads.length > 1;
  const cardW = multi
    ? Math.max(240, (trackW || 1) - PEEK)
    : trackW > 0
      ? trackW
      : ("100%" as const);

  return (
    <>
      <View style={styles.wrap} onLayout={onTrackLayout}>
        {multi ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            snapToInterval={typeof cardW === "number" ? cardW + GAP : undefined}
            contentContainerStyle={styles.row}
          >
            {ads.map((ad) => (
              <AdCard
                key={ad.id}
                ad={ad}
                width={typeof cardW === "number" ? cardW : 280}
                onCta={(a) => void onCta(a)}
              />
            ))}
          </ScrollView>
        ) : (
          <AdCard ad={ads[0]!} width={cardW} onCta={(a) => void onCta(a)} />
        )}
      </View>

      <Modal
        visible={sheetAd != null}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetAd(null)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setSheetAd(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHandle} />
            {sheetAd?.sheetTitle || sheetAd?.title ? (
              <Text style={styles.sheetTitle}>{sheetAd?.sheetTitle || sheetAd?.title}</Text>
            ) : null}
            {sheetAd?.sheetBody || sheetAd?.body ? (
              <Text style={styles.sheetBody}>{sheetAd?.sheetBody || sheetAd?.body}</Text>
            ) : null}
            {sheetAd?.ctaUrl?.trim() ? (
              <Pressable
                style={styles.sheetLinkBtn}
                onPress={() => {
                  void Linking.openURL(sheetAd.ctaUrl!.trim()).catch(() => {});
                }}
              >
                <Text style={styles.sheetLinkText}>{sheetAd.ctaLabel || "Open link"}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.sheetClose} onPress={() => setSheetAd(null)}>
              <Text style={styles.sheetCloseText}>Close</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch", width: "100%", marginTop: 8, marginBottom: 8 },
  row: { gap: GAP },
  card: {
    borderRadius: CARD_RADIUS,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
    overflow: "hidden",
    backgroundColor: "#4A1515",
  },
  image: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  fallback: { backgroundColor: "#6B1D1D" },
  gradient: { ...StyleSheet.absoluteFillObject },
  copy: {
    flex: 1,
    width: "62%",
    justifyContent: "center",
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 12,
  },
  promo: { color: "#FFFFFF" },
  title: {
    fontFamily: LORA_BOLD,
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.15,
  },
  body: {
    fontFamily: LORA,
    color: "rgba(255,255,255,0.95)",
    fontSize: 13,
    lineHeight: 18,
  },
  cta: {
    alignSelf: "flex-start",
    marginTop: 10,
    backgroundColor: "#fff",
    borderRadius: CTA_RADIUS,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: { fontFamily: LORA_BOLD, color: "#0F172A", fontSize: 12 },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 28,
    maxHeight: "70%",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginBottom: 14,
  },
  sheetTitle: { fontFamily: LORA_BOLD, fontSize: 18, color: "#0F172A", marginBottom: 8 },
  sheetBody: { fontFamily: LORA, fontSize: 14, lineHeight: 21, color: "#475569" },
  sheetLinkBtn: {
    marginTop: 18,
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  sheetLinkText: { fontFamily: LORA_BOLD, color: "#fff", fontSize: 14 },
  sheetClose: { marginTop: 12, paddingVertical: 10, alignItems: "center" },
  sheetCloseText: { fontFamily: LORA, color: "#64748B", fontSize: 14 },
});
