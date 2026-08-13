/**
 * Learning centre — light mode only.
 * Super Admin YouTube videos grouped by section; tap opens YouTube.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Linking,
  useWindowDimensions,
  AppState,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  FONT_LORA,
  FONT_LORA_BOLD,
} from "@/constants/theme";
import {
  fetchMerchantLearningCentre,
  type LearningCentreSection,
  type LearningCentreVideo,
} from "@/services/learningCentreApi";
import { resolveImageUrl } from "@/services/outletApi";
import { youtubeWatchUrl } from "@/lib/youtube";
import { useAuth } from "@/context/AuthContext";
import { AuthProxyImage } from "@/components/AuthProxyImage";
import { onLearningCentreSignal } from "@/lib/learningCentreSignalBus";

const CARD_W = 220;
const CARD_H = 124;

async function openYoutube(video: LearningCentreVideo) {
  const url = video.youtubeUrl?.trim() || (video.youtubeId ? youtubeWatchUrl(video.youtubeId) : "");
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    /* ignore */
  }
}

function VideoCard({
  video,
  token,
}: {
  video: LearningCentreVideo;
  token: string | null;
}) {
  const thumb = resolveImageUrl(video.thumbnailUrl);
  const needsAuth =
    !!thumb &&
    (thumb.includes("/attachments/proxy") || thumb.includes("/v1/attachments/"));

  return (
    <Pressable
      onPress={() => void openYoutube(video)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={video.videoTitle}
    >
      <View style={styles.thumbWrap}>
        {thumb && needsAuth && token ? (
          <AuthProxyImage
            uri={thumb}
            token={token}
            style={styles.thumb}
            resizeMode="cover"
          />
        ) : thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Ionicons name="play-circle" size={36} color="#fff" />
          </View>
        )}
        <View style={styles.thumbScrim} />
        <View style={styles.playCircle} pointerEvents="none">
          <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
        </View>
        {video.durationLabel ? (
          <View style={styles.durationPill}>
            <Text style={styles.durationText}>{video.durationLabel}</Text>
          </View>
        ) : null}
        <Text style={styles.cardTitle} numberOfLines={2}>
          {video.videoTitle}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LearningCentreScreen() {
  const { width } = useWindowDimensions();
  const { token } = useAuth();
  const [sections, setSections] = useState<LearningCentreSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const revisionRef = useRef("");
  const loadGenRef = useRef(0);

  const load = useCallback(async (silent?: boolean) => {
    const gen = ++loadGenRef.current;
    if (!silent) setLoading(true);
    if (!silent) setError(false);
    try {
      const data = await fetchMerchantLearningCentre();
      if (gen !== loadGenRef.current) return;
      const next = (Array.isArray(data.sections) ? data.sections : []).map((section) => ({
        ...section,
        videos: Array.isArray(section.videos) ? section.videos : [],
      }));
      const rev = data.revision ?? JSON.stringify(next);
      if (rev !== revisionRef.current) {
        revisionRef.current = rev;
        setSections(next);
      }
      setError(false);
    } catch {
      if (gen !== loadGenRef.current) return;
      if (!silent) {
        setError(true);
        setSections([]);
      }
    } finally {
      if (gen === loadGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(revisionRef.current !== "");
      const unsub = onLearningCentreSignal(() => {
        void load(true);
      });
      const appSub = AppState.addEventListener("change", (state) => {
        if (state === "active") void load(true);
      });
      const poll = setInterval(() => {
        void load(true);
      }, 15_000);
      return () => {
        unsub();
        appSub.remove();
        clearInterval(poll);
        loadGenRef.current += 1;
      };
    }, [load])
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = !q
      ? sections
      : sections
          .map((section) => ({
            ...section,
            videos: (Array.isArray(section.videos) ? section.videos : []).filter(
              (v) =>
                (v.videoTitle ?? "").toLowerCase().includes(q) ||
                (section.title ?? "").toLowerCase().includes(q)
            ),
          }))
          .filter((section) => section.videos.length > 0);
    return [...next].sort(
      (a, b) => (a.sectionNumber ?? 999) - (b.sectionNumber ?? 999) || a.title.localeCompare(b.title)
    );
  }, [sections, query]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          colors={[GatiMitraMerchant.primary]}
          tintColor={GatiMitraMerchant.primary}
        />
      }
    >
      <View style={styles.banner}>
        <View style={[styles.bannerCopy, { maxWidth: Math.min(width - 80, 240) }]}>
          <Text style={styles.bannerBrand}>GatiMitra</Text>
          <Text style={styles.bannerTitle}>Grow with GatiMitra</Text>
          <Text style={styles.bannerSub}>
            Simple, bite-sized learning videos
          </Text>
          <Text style={styles.bannerTag}>India's Lowest Commission platform</Text>
        </View>
        <View style={styles.bannerIconWrap}>
          <Ionicons name="bulb" size={42} color={GatiMitraMerchant.navy} />
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={GatiMitraMerchant.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search any topic."
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={GatiMitraMerchant.primary} />
        </View>
      ) : error ? (
        <Pressable onPress={() => void load()} style={styles.centerBox}>
          <Text style={styles.emptyText}>Could not load videos. Tap to retry.</Text>
        </Pressable>
      ) : filtered.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>
            {query.trim()
              ? "No videos match your search."
              : "Learning videos will appear here once Super Admin uploads them."}
          </Text>
        </View>
      ) : (
        filtered.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.row}
            >
              {(Array.isArray(section.videos) ? section.videos : []).map((video) => (
                <VideoCard key={video.id} video={video} token={token} />
              ))}
            </ScrollView>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { paddingHorizontal: H_PADDING, paddingTop: 12, paddingBottom: 32 },
  pressed: { opacity: 0.9 },

  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F8F3",
    borderRadius: CARD_RADIUS,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
    overflow: "hidden",
  },
  bannerCopy: { flex: 1, paddingRight: 8 },
  bannerBrand: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 13,
    color: GatiMitraMerchant.navy,
    marginBottom: 2,
  },
  bannerTitle: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 18,
    color: GatiMitraMerchant.textPrimary,
  },
  bannerSub: {
    fontFamily: FONT_LORA,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  bannerTag: {
    fontFamily: FONT_LORA,
    fontSize: 12,
    color: GatiMitraMerchant.navy,
    marginTop: 6,
  },
  bannerIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT_LORA,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },

  section: { marginBottom: 22 },
  sectionTitle: {
    fontFamily: FONT_LORA_BOLD,
    fontSize: 17,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  row: { gap: 12, paddingRight: 8 },

  card: { width: CARD_W },
  thumbWrap: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#1E293B",
  },
  thumb: { ...StyleSheet.absoluteFillObject },
  thumbFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.navy,
  },
  thumbScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.28)",
  },
  playCircle: {
    position: "absolute",
    alignSelf: "center",
    top: CARD_H / 2 - 18,
    left: CARD_W / 2 - 18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  durationPill: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(15,23,42,0.78)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  durationText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  cardTitle: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    fontFamily: FONT_LORA_BOLD,
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 17,
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  centerBox: { paddingVertical: 48, alignItems: "center" },
  emptyText: {
    fontFamily: FONT_LORA,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
});
