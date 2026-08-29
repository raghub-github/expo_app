import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { Audio, Video, ResizeMode, type AVPlaybackStatus } from "expo-av";
import { GatiMitraColors } from "@/constants/gatimitra";
import {
  HEADER_IMAGE_HEIGHT,
  SCREEN_WIDTH_EXPORT,
  merchantHeroMediaVisibleHeight,
} from "../constants/layout";
import { prefetchMerchantHeroImageUri } from "@/lib/merchantHeroWarmCache";

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
  }: Props) {
    const videoRef = useRef<Video>(null);
    const videoReadyRef = useRef(false);

    useLayoutEffect(() => {
      if (!uri) return;
      prefetchMerchantHeroImageUri(uri);
    }, [uri]);

    const bleed = Math.max(0, statusBarInset);
    const video = (videoUri ?? "").trim();
    const showVideo = video.length > 0;

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
        if (shouldPlayVideo) {
          await player.playAsync();
        } else {
          await player.pauseAsync();
        }
      } catch {
        // Player may be unloading between hero/video swaps.
      }
    }, [shouldPlayVideo]);

    useEffect(() => {
      void syncVideoPlayback();
    }, [syncVideoPlayback]);

    const onVideoStatus = useCallback(
      (status: AVPlaybackStatus) => {
        if (!status.isLoaded) return;
        if (!videoReadyRef.current) {
          videoReadyRef.current = true;
          void syncVideoPlayback();
        }
      },
      [syncVideoPlayback]
    );

    const totalHeight = mediaHeight + bleed;

    return (
      <View
        style={[styles.wrap, { height: totalHeight, marginTop: bleed > 0 ? -bleed : 0 }]}
        collapsable={false}
        pointerEvents="none"
      >
        {showVideo ? (
          <>
            {uri ? (
              <Image
                source={{ uri }}
                style={[styles.image, { height: totalHeight }]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                recyclingKey={uri}
                priority="high"
                allowDownscaling
              />
            ) : (
              <View style={styles.placeholder} />
            )}
            <Video
              ref={videoRef}
              source={{ uri: video }}
              style={[StyleSheet.absoluteFill, { height: totalHeight }]}
              resizeMode={ResizeMode.COVER}
              shouldPlay={shouldPlayVideo}
              isLooping
              isMuted
              volume={0}
              useNativeControls={false}
              progressUpdateIntervalMillis={500}
              onPlaybackStatusUpdate={onVideoStatus}
              onReadyForDisplay={(ev) => {
                const nat = ev.naturalSize;
                if (nat?.width && nat?.height) {
                  applyAspectRatio(nat.width, nat.height);
                }
              }}
            />
          </>
        ) : uri ? (
          <Image
            source={{ uri }}
            style={[styles.image, { height: totalHeight }]}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={0}
            recyclingKey={uri}
            priority="high"
            allowDownscaling
          />
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>
    );
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.videoUri === next.videoUri &&
    prev.merchantId === next.merchantId &&
    prev.statusBarInset === next.statusBarInset &&
    prev.shouldPlayVideo === next.shouldPlayVideo &&
    prev.onHeroHeightChange === next.onHeroHeightChange
);

const styles = StyleSheet.create({
  wrap: {
    width: SCREEN_WIDTH_EXPORT,
    overflow: "hidden",
    backgroundColor: GatiMitraColors.mintSoft,
  },
  image: {
    width: SCREEN_WIDTH_EXPORT,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: GatiMitraColors.mintSoft,
  },
});
