import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "@/components/AppText";
import { AuthProxyImage } from "@/components/AuthProxyImage";
import { acquireMerchantChromeDim } from "@/lib/merchantChromeDim";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const SLIDE_H = SCREEN_H * 0.72;

export function FeedbackImageViewerModal({
  visible,
  urls,
  initialIndex,
  token,
  onClose,
}: {
  visible: boolean;
  urls: string[];
  initialIndex: number;
  token?: string | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<string>>(null);
  const start = Math.max(0, Math.min(initialIndex, Math.max(0, urls.length - 1)));
  const [pageIndex, setPageIndex] = useState(start);

  useEffect(() => {
    if (!visible) return;
    return acquireMerchantChromeDim();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const idx = Math.max(0, Math.min(initialIndex, Math.max(0, urls.length - 1)));
    setPageIndex(idx);
    requestAnimationFrame(() => {
      if (idx > 0 && urls.length > 0) {
        listRef.current?.scrollToIndex({ index: idx, animated: false });
      }
    });
  }, [visible, initialIndex, urls]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    setPageIndex(idx);
  }, []);

  if (!visible || urls.length === 0) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      {...(Platform.OS === "android" ? { navigationBarTranslucent: true } : null)}
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

        {urls.length > 1 ? (
          <View style={[styles.counter, { top: insets.top + 14 }]}>
            <Text style={styles.counterText}>
              {pageIndex + 1} / {urls.length}
            </Text>
          </View>
        ) : null}

        <FlatList
          ref={listRef}
          data={urls}
          keyExtractor={(item, index) => `${item}-${index}`}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={start > 0 ? start : undefined}
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
          renderItem={({ item }) => (
            <View style={styles.slide}>
              <AuthProxyImage uri={item} token={token} style={styles.image} resizeMode="contain" />
            </View>
          )}
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
    paddingHorizontal: 16,
  },
  image: {
    width: SCREEN_W - 32,
    height: SLIDE_H,
    borderRadius: 12,
  },
});
