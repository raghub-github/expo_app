/**
 * Packaging tips video — autoplays, cannot skip, complete only after full watch.
 * Video is isolated from progress UI re-renders so the native player stays stable.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  StatusBar,
  Platform,
  BackHandler,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Video, ResizeMode, Audio, InterruptionModeAndroid, type AVPlaybackStatus } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "@/components/AppText";
import { GatiMitraMerchant, FONT_LORA, FONT_LORA_BOLD } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { useMerchantGoBack } from "@/lib/merchantNavigation";
import { markPackagingTipsCompleted } from "@/lib/onboardingBenefitsStorage";
import { MX } from "@/lib/appAssetKeys";
import { getAppAssetUrl, reloadMerchantAppAssets } from "@/store/appAssetsStore";

function formatClock(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "00:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type PlayerProps = {
  uri: string;
  videoRef: React.RefObject<Video | null>;
  onStatus: (status: AVPlaybackStatus) => void;
  onError: () => void;
};

const FrozenVideo = memo(function FrozenVideo({
  uri,
  videoRef,
  onStatus,
  onError,
}: PlayerProps) {
  const source = useMemo(() => ({ uri }), [uri]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" collapsable={false}>
      <Video
        ref={videoRef}
        source={source}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping={false}
        isMuted={false}
        useNativeControls={false}
        progressUpdateIntervalMillis={1000}
        onPlaybackStatusUpdate={onStatus}
        onError={onError}
        pointerEvents="none"
      />
    </View>
  );
});

export default function PackagingTipsScreen() {
  const goBack = useMerchantGoBack("/(tabs)/onboarding-benefits");
  const insets = useSafeAreaInsets();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.store_id ?? null;
  const videoRef = useRef<Video>(null);
  const mountedRef = useRef(true);
  const leavingRef = useRef(false);
  const lastUiTickRef = useRef(0);
  const durationRef = useRef(0);

  const [videoUrl, setVideoUrl] = useState<string | null>(() =>
    getAppAssetUrl(MX.onboarding.packagingTipsVideo)
  );
  const [watchedToEnd, setWatchedToEnd] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [playerVisible, setPlayerVisible] = useState(true);

  const resetAudio = useCallback(async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      });
    } catch {
      /* ignore */
    }
  }, []);

  const teardownPlayer = useCallback(async () => {
    const player = videoRef.current;
    if (player) {
      try {
        await player.stopAsync();
      } catch {
        /* already stopped */
      }
      try {
        await player.unloadAsync();
      } catch {
        /* already unloaded */
      }
    }
    if (mountedRef.current) setPlayerVisible(false);
    await resetAudio();
  }, [resetAudio]);

  const leaveWithoutComplete = useCallback(() => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    void teardownPlayer().finally(() => goBack());
  }, [goBack, teardownPlayer]);

  const completeAndLeave = useCallback(() => {
    if (!watchedToEnd || leavingRef.current) return;
    leavingRef.current = true;
    if (storeId) {
      void markPackagingTipsCompleted(storeId, {
        storeDbId: selectedStore?.id ?? null,
        token,
      });
    }
    void teardownPlayer().finally(() => goBack());
  }, [watchedToEnd, storeId, selectedStore?.id, token, goBack, teardownPlayer]);

  useEffect(() => {
    mountedRef.current = true;
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
    }).catch(() => undefined);
    return () => {
      mountedRef.current = false;
      void teardownPlayer();
    };
  }, [teardownPlayer]);

  useEffect(() => {
    const onAppState = (next: AppStateStatus) => {
      if (next !== "active") {
        void teardownPlayer();
      } else if (mountedRef.current && !leavingRef.current) {
        setPlayerVisible(true);
      }
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [teardownPlayer]);

  useFocusEffect(
    useCallback(() => {
      leavingRef.current = false;
      setPlayerVisible(true);
      if (Platform.OS === "android") {
        StatusBar.setBackgroundColor("#0B1A14");
        StatusBar.setBarStyle("light-content");
        StatusBar.setTranslucent(false);
      }
      if (!getAppAssetUrl(MX.onboarding.packagingTipsVideo)) {
        void reloadMerchantAppAssets().then(() => {
          if (!mountedRef.current) return;
          const url = getAppAssetUrl(MX.onboarding.packagingTipsVideo);
          if (url) setVideoUrl((prev) => prev || url);
        });
      }
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        leaveWithoutComplete();
        return true;
      });
      return () => {
        sub.remove();
        void teardownPlayer();
      };
    }, [leaveWithoutComplete, teardownPlayer])
  );

  const onPlaybackStatus = useCallback((status: AVPlaybackStatus) => {
    if (!mountedRef.current) return;
    if (!status.isLoaded) {
      if ("error" in status && status.error) {
        setLoadError("Could not play this video. Check your connection and try again.");
        setBuffering(false);
      }
      return;
    }

    if (status.durationMillis && status.durationMillis !== durationRef.current) {
      durationRef.current = status.durationMillis;
      setDurationMs(status.durationMillis);
    } else if (status.durationMillis) {
      durationRef.current = status.durationMillis;
    }

    const now = Date.now();
    if (now - lastUiTickRef.current >= 900) {
      lastUiTickRef.current = now;
      setPositionMs(status.positionMillis ?? 0);
    }

    setPlaying((prev) => (prev === status.isPlaying ? prev : status.isPlaying));
    const nextBuffering = Boolean(status.isBuffering) && !status.isPlaying;
    setBuffering((prev) => (prev === nextBuffering ? prev : nextBuffering));

    const dur = status.durationMillis ?? durationRef.current;
    const nearEnd =
      dur > 1000 && status.positionMillis >= Math.max(0, dur - 600);
    if (status.didJustFinish || nearEnd) {
      setWatchedToEnd(true);
      if (status.didJustFinish) setPlaying(false);
    }
  }, []);

  const onPlayerError = useCallback(() => {
    if (!mountedRef.current) return;
    setLoadError("Could not play this video. Check your connection and try again.");
    setBuffering(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoUrl || loadError || leavingRef.current) return;
    const player = videoRef.current;
    if (!player) return;
    if (playing) {
      void player.pauseAsync().catch(() => undefined);
      return;
    }
    void (async () => {
      const status = await player.getStatusAsync();
      if (
        status.isLoaded &&
        status.durationMillis &&
        status.positionMillis >= status.durationMillis - 600
      ) {
        await player.setPositionAsync(0);
      }
      await player.playAsync();
    })().catch(() => undefined);
  }, [videoUrl, loadError, playing]);

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 8) }]}>
      <ExpoStatusBar style="light" />
      {Platform.OS === "android" ? (
        <StatusBar backgroundColor="#0B1A14" barStyle="light-content" />
      ) : null}

      <View style={styles.header}>
        <Pressable
          onPress={leaveWithoutComplete}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </Pressable>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>GatiMitra</Text>
          <Text style={styles.headerBrand}>India&apos;s Lowest Commission platform</Text>
        </View>
      </View>

      <View style={styles.player} collapsable={false}>
        {videoUrl && !loadError && playerVisible ? (
          <FrozenVideo
            uri={videoUrl}
            videoRef={videoRef}
            onStatus={onPlaybackStatus}
            onError={onPlayerError}
          />
        ) : videoUrl && !loadError ? (
          <View style={styles.emptyPlayer} pointerEvents="none">
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : (
          <View style={styles.emptyPlayer}>
            <Ionicons name="videocam-outline" size={40} color="rgba(255,255,255,0.7)" />
            <Text style={styles.emptyTitle}>
              {loadError ?? "Packaging video is not uploaded yet"}
            </Text>
            <Text style={styles.emptyBody}>
              {loadError
                ? "Go back and open this page again once your connection is stable."
                : "Ask Super Admin to upload the packaging tips video in App images."}
            </Text>
          </View>
        )}

        {videoUrl && !loadError && playerVisible ? (
          <View style={styles.playHit} pointerEvents="box-none">
            {buffering ? (
              <ActivityIndicator color="#fff" size="large" />
            ) : playing ? null : (
              <Pressable
                onPress={togglePlay}
                style={styles.playBtn}
                accessibilityRole="button"
                accessibilityLabel={watchedToEnd ? "Replay" : "Play"}
              >
                <Ionicons name={watchedToEnd ? "refresh" : "play"} size={32} color="#fff" />
              </Pressable>
            )}
          </View>
        ) : null}

        {videoUrl && !loadError && playerVisible ? (
          <View style={styles.scrubWrap} pointerEvents="none">
            <Text style={styles.time}>{formatClock(positionMs)}</Text>
            <View style={styles.track}>
              <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
            <Pressable
              onPress={() => {
                setMuted((v) => {
                  const next = !v;
                  void videoRef.current?.setIsMutedAsync(next).catch(() => undefined);
                  return next;
                });
              }}
              hitSlop={10}
              style={styles.muteBtn}
              pointerEvents="auto"
              accessibilityRole="button"
              accessibilityLabel={muted ? "Unmute" : "Mute"}
            >
              <Ionicons name={muted ? "volume-mute" : "volume-medium"} size={18} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Pressable
          onPress={completeAndLeave}
          disabled={!watchedToEnd}
          style={({ pressed }) => [
            styles.gotIt,
            !watchedToEnd && styles.gotItDisabled,
            pressed && watchedToEnd && { opacity: 0.9 },
          ]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !watchedToEnd }}
          accessibilityLabel="Got it"
        >
          <Text style={[styles.gotItText, !watchedToEnd && styles.gotItTextDisabled]}>Got it</Text>
        </Pressable>
        {!watchedToEnd ? (
          <Text style={styles.hint}>Watch the full video to continue</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0B1A14",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextCol: { flex: 1, minWidth: 0, alignItems: "center", marginRight: 40 },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONT_LORA_BOLD,
    color: "#fff",
    textAlign: "center",
  },
  headerBrand: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: FONT_LORA,
    color: "rgba(255,255,255,0.72)",
    textAlign: "center",
  },
  player: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.primary,
    overflow: "hidden",
  },
  playHit: {
    ...StyleSheet.absoluteFillObject,
    bottom: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(15,23,42,0.72)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrubWrap: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  time: {
    width: 44,
    fontSize: 12,
    fontFamily: FONT_LORA,
    color: "#fff",
  },
  track: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    overflow: "hidden",
  },
  trackFill: {
    height: "100%",
    backgroundColor: "#fff",
  },
  muteBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPlayer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 8,
    backgroundColor: "#12352C",
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontFamily: FONT_LORA_BOLD,
    color: "#fff",
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: FONT_LORA,
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    backgroundColor: "#111827",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  gotIt: {
    height: 52,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  gotItDisabled: {
    backgroundColor: "#4B5563",
  },
  gotItText: {
    fontSize: 17,
    fontFamily: FONT_LORA_BOLD,
    color: "#111827",
  },
  gotItTextDisabled: {
    color: "rgba(255,255,255,0.55)",
  },
  hint: {
    marginTop: 8,
    fontSize: 12,
    fontFamily: FONT_LORA,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },
});
