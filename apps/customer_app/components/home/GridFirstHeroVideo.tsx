import { memo, useEffect, useRef } from "react";
import { AppState, Platform, StyleSheet } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

type Props = {
  uri: string;
  shouldPlay: boolean;
  onReady?: () => void;
  onAspectRatio?: (ratio: number) => void;
};

/** Hardware-accelerated looped hero video — stays mounted; play/pause only when needed. */
export const GridFirstHeroVideo = memo(function GridFirstHeroVideo(props: Props) {
  return (
    <AppErrorBoundary source="hero-video" fallback={() => null}>
      <GridFirstHeroVideoInner {...props} />
    </AppErrorBoundary>
  );
});

const GridFirstHeroVideoInner = memo(function GridFirstHeroVideoInner({
  uri,
  shouldPlay,
  onReady,
  onAspectRatio,
}: Props) {
  const readyRef = useRef(false);
  const shouldPlayRef = useRef(shouldPlay);
  shouldPlayRef.current = shouldPlay;

  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
    p.volume = 0;
    p.audioMixingMode = "mixWithOthers";
    p.timeUpdateEventInterval = 0;
    if (Platform.OS === "android") {
      p.bufferOptions = {
        preferredForwardBufferDuration: 2,
        minBufferForPlayback: 1,
        waitsToMinimizeStalling: false,
      };
    }
  });

  useEffect(() => {
    readyRef.current = false;
  }, [uri]);

  useEffect(() => {
    const markReady = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      onReady?.();
      if (shouldPlayRef.current) {
        player.play();
      }
    };

    const sourceSub = player.addListener("sourceLoad", (payload) => {
      const track = payload.availableVideoTracks?.[0];
      const w = track?.size?.width;
      const h = track?.size?.height;
      if (w && h && w > 0 && h > 0) {
        onAspectRatio?.(Number((w / h).toFixed(4)));
      }
      markReady();
    });

    const statusSub = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") markReady();
    });

    return () => {
      sourceSub.remove();
      statusSub.remove();
    };
  }, [player, onReady, onAspectRatio]);

  useEffect(() => {
    if (!readyRef.current) return;
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
    }
  }, [shouldPlay, player]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (!readyRef.current) return;
      if (state === "active" && shouldPlayRef.current) {
        player.play();
      } else {
        player.pause();
      }
    });
    return () => sub.remove();
  }, [player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      nativeControls={false}
      allowsFullscreen={false}
      surfaceType={Platform.OS === "android" ? "textureView" : undefined}
    />
  );
});
