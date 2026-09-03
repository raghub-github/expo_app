import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Audio, Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import {
  runOnJS,
  useAnimatedReaction,
  type SharedValue,
} from "react-native-reanimated";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  HEADER_IMAGE_HEIGHT,
  SCREEN_WIDTH_EXPORT,
  merchantHeroMediaVisibleHeight,
} from "../constants/layout";
import { prefetchMerchantHeroImageUri, getWarmMerchantHeroUri } from "@/lib/merchantHeroWarmCache";
import {
  markHeroMediaSessionReady,
} from "@/lib/prefetchGridFirstHeroMedia";

/** Same soft/white shell as grocery & food grid-first before hero media paints. */
const HERO_SHELL = GatiMitraColors.softBackground;

type Props = {
  /** Banner image — fallback hero and video poster. */
  uri: string | null;
  /** When set, plays looped muted video instead of static banner on inner page. */
  videoUri?: string | null;
  merchantId: string;
  /** Draw banner behind translucent status bar (immersive hero). */
  statusBarInset?: number;
  /** Fires when measured hero height changes (video aspect ratio). */
  onHeroHeightChange?: (height: number) => void;
  /** Pause looped video once the hero scrolls off screen. */
  shouldPlayVideo?: boolean;
  /** Optional: pause video on UI thread when scroll passes this Y (no parent re-render). */
  scrollY?: SharedValue<number>;
  pauseVideoAfterY?: number;
};

function normalizeAspect(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0.15 || value > 8) return null;
  return Number(value.toFixed(4));
}

/** Non-virtualized hero — mounts once in ListHeader, shows cached banner or admin video. */
export const MerchantHeroBannerRow = React.memo(
  function MerchantHeroBannerRow({
    uri,
    videoUri,
    merchantId,
    statusBarInset = 0,
    onHeroHeightChange,
    shouldPlayVideo = true,
    scrollY,
    pauseVideoAfterY,
  }: Props) {
    const videoRef = useRef<Video>(null);
    const videoReadyRef = useRef(false);
    const [videoReady, setVideoReady] = useState(false);
    const [scrollAllowsPlay, setScrollAllowsPlay] = useState(true);

    useAnimatedReaction(
      () => {
        if (!scrollY || pauseVideoAfterY == null) return true;
        return scrollY.value < pauseVideoAfterY;
      },
      (allowed, prev) => {
        if (allowed === prev) return;
        runOnJS(setScrollAllowsPlay)(allowed);
      },
      [scrollY, pauseVideoAfterY]
    );

    const playVideo = shouldPlayVideo && scrollAllowsPlay;
    const bleed = Math.max(0, statusBarInset);
    const video = (videoUri ?? "").trim();
    const showVideo = video.length > 0;
    const posterUri = uri || getWarmMerchantHeroUri(merchantId);

    useLayoutEffect(() => {
      if (!posterUri) return;
      prefetchMerchantHeroImageUri(posterUri);
    }, [posterUri]);

    useEffect(() => {
      setVideoReady(false);
      videoReadyRef.current = false;
    }, [video, merchantId]);

    useEffect(() => {
      if (!showVideo) return;
      void Audio.setAudioModeAsync({
        playsInSilentModeIOS: false,
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
    }, [showVideo]);

    const [mediaHeight, setMediaHeight] = useState(HEADER_IMAGE_HEIGHT);
    const reportedAspectRef = useRef<string | null>(null);

    useEffect(() => {
      reportedAspectRef.current = null;
      videoReadyRef.current = false;
      setMediaHeight(HEADER_IMAGE_HEIGHT);
      onHeroHeightChange?.(HEADER_IMAGE_HEIGHT + bleed);
    }, [video, uri, merchantId, onHeroHeightChange, bleed]);

    const applyAspectRatio = useCallback(
      (width: number, height: number) => {
        const ratio = normalizeAspect(width / height);
        if (!ratio) return;
        const key = `${video}:${Math.round(width)}x${Math.round(height)}`;
        if (reportedAspectRef.current === key) return;
        reportedAspectRef.current = key;
        const nextHeight = merchantHeroMediaVisibleHeight(SCREEN_WIDTH_EXPORT, ratio);
        setMediaHeight(nextHeight);
        onHeroHeightChange?.(nextHeight + bleed);
      },
      [onHeroHeightChange, video, bleed]
    );

    const syncVideoPlayback = useCallback(async () => {
      const player = videoRef.current;
      if (!player || !videoReadyRef.current) return;
      try {
        await player.setIsMutedAsync(true);
        await player.setVolumeAsync(0);
        if (playVideo) {
          await player.playAsync();
        } else {
          await player.pauseAsync();
        }
      } catch {
        // Player may be unloading between hero/video swaps.
      }
    }, [playVideo]);

    useEffect(() => {
      void syncVideoPlayback();
    }, [syncVideoPlayback]);

    const onVideoStatus = useCallback(
      (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if (!videoReadyRef.current) {
          videoReadyRef.current = true;
          setVideoReady(true);
          void syncVideoPlayback();
        }
      },
      [syncVideoPlayback]
    );

    const onImageLoad = useCallback(() => {
      if (posterUri) markHeroMediaSessionReady(posterUri);
    }, [posterUri]);

    const totalHeight = mediaHeight + bleed;
    const showPoster = Boolean(posterUri);
    // Banner image always visible (cache-friendly). Video fades in over it when ready.
    const videoOpacity = videoReady ? 1 : 0;

    return (
      <View
        style={[styles.wrap, { height: totalHeight, marginTop: bleed > 0 ? -bleed : 0 }]}
        collapsable={false}
        pointerEvents="none"
      >
        <View style={styles.shell} />

        {showVideo ? (
          <>
            {showPoster ? (
              <Image
                source={{ uri: posterUri! }}
                style={[styles.image, { height: totalHeight }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                recyclingKey={`merchant-hero-${merchantId}`}
                priority="high"
                allowDownscaling
                onLoad={onImageLoad}
              />
            ) : null}
            <Video
              ref={videoRef}
              source={{ uri: video }}
              style={[
                StyleSheet.absoluteFill,
                { height: totalHeight, opacity: videoOpacity },
              ]}
              resizeMode={ResizeMode.COVER}
              shouldPlay={playVideo}
              isLooping
              isMuted
              volume={0}
              useNativeControls={false}
              progressUpdateIntervalMillis={500}
              onPlaybackStatusUpdate={onVideoStatus}
              onReadyForDisplay={(ev) => {
                setVideoReady(true);
                videoReadyRef.current = true;
                const nat = ev.naturalSize;
                if (nat?.width && nat?.height) {
                  applyAspectRatio(nat.width, nat.height);
                }
                void syncVideoPlayback();
              }}
            />
          </>
        ) : showPoster ? (
          <Image
            source={{ uri: posterUri! }}
            style={[styles.image, { height: totalHeight }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={`merchant-hero-${merchantId}`}
            priority="high"
            allowDownscaling
            onLoad={onImageLoad}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.videoUri === next.videoUri &&
    prev.merchantId === next.merchantId &&
    prev.statusBarInset === next.statusBarInset &&
    prev.shouldPlayVideo === next.shouldPlayVideo &&
    prev.scrollY === next.scrollY &&
    prev.pauseVideoAfterY === next.pauseVideoAfterY &&
    prev.onHeroHeightChange === next.onHeroHeightChange
);

const styles = StyleSheet.create({
  wrap: {
    width: SCREEN_WIDTH_EXPORT,
    overflow: "hidden",
    backgroundColor: HERO_SHELL,
  },
  shell: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: HERO_SHELL,
  },
  image: {
    width: SCREEN_WIDTH_EXPORT,
  },
});
