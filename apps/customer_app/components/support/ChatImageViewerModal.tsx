import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import { FlatList } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SLIDE_H = SCREEN_H * 0.72;

type ChatImageViewerModalProps = {
  visible: boolean;
  uris: string[];
  initialUri: string | null;
  onClose: () => void;
};

function ZoomableSlide({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
  }, [uri, scale, savedScale]);

  const pinch = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = Math.min(4, Math.max(0.85, savedScale.value * event.scale));
    })
    .onEnd(() => {
      if (scale.value < 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        return;
      }
      if (scale.value > 4) {
        scale.value = withSpring(4);
        savedScale.value = 4;
        return;
      }
      savedScale.value = scale.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        return;
      }
      scale.value = withSpring(2.2);
      savedScale.value = 2.2;
    });

  const composed = Gesture.Simultaneous(pinch, doubleTap);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.slide}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.imageWrap, imageStyle]}>
          <Image source={{ uri }} style={styles.image} contentFit="contain" transition={120} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function ChatImageViewerModal({
  visible,
  uris,
  initialUri,
  onClose,
}: ChatImageViewerModalProps) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<string>>(null);
  const initialIndex = Math.max(
    0,
    initialUri ? uris.findIndex((u) => u === initialUri) : 0
  );
  const [pageIndex, setPageIndex] = useState(initialIndex);

  useEffect(() => {
    if (!visible) return;
    const idx = Math.max(0, initialUri ? uris.findIndex((u) => u === initialUri) : 0);
    setPageIndex(idx);
    requestAnimationFrame(() => {
      if (idx > 0 && uris.length > 0) {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
      }
    });
  }, [visible, initialUri, uris]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setPageIndex(idx);
  }, []);

  if (!visible || uris.length === 0 || !initialUri) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 10 }]}
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close image"
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>

        {uris.length > 1 ? (
          <View style={[styles.counter, { top: insets.top + 14 }]}>
            <AppText style={styles.counterText}>
              {pageIndex + 1} / {uris.length}
            </AppText>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={uris}
          keyExtractor={(item, index) => `${item}-${index}`}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex > 0 ? initialIndex : undefined}
          getItemLayout={(_, index) => ({
            length: SCREEN_W,
            offset: SCREEN_W * index,
            index,
          })}
          onScrollToIndexFailed={(info) => {
            requestAnimationFrame(() => {
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: false,
              });
            });
          }}
          onMomentumScrollEnd={onScrollEnd}
          renderItem={({ item }) => <ZoomableSlide uri={item} />}
          style={styles.pager}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 3,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    position: "absolute",
    alignSelf: "center",
    zIndex: 3,
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  pager: {
    flexGrow: 0,
  },
  slide: {
    width: SCREEN_W,
    height: SLIDE_H,
    justifyContent: "center",
    alignItems: "center",
  },
  imageWrap: {
    width: SCREEN_W - 32,
    height: SLIDE_H,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
