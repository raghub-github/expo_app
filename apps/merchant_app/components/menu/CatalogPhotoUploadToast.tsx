import { useEffect, useRef, useState } from "react";
import { View, Text, Image, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  previewUri: string | null;
  message?: string;
  onHide: () => void;
  durationMs?: number;
};

export function CatalogPhotoUploadToast({
  visible,
  previewUri,
  message = "Photo uploaded & sent for review",
  onHide,
  durationMs = 2500,
}: Props) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHideRef = useRef(onHide);
  const [renderedUri, setRenderedUri] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  onHideRef.current = onHide;

  useEffect(() => {
    if (visible && previewUri) {
      setRenderedUri(previewUri);
      setMounted(true);
    }
  }, [visible, previewUri]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    if (!visible || !renderedUri) {
      if (!mounted) return;
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 24, duration: 180, useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (finished) {
          setMounted(false);
          setRenderedUri(null);
        }
      });
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();

    timerRef.current = setTimeout(() => {
      onHideRef.current();
      timerRef.current = null;
    }, durationMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [visible, durationMs, opacity, translateY, renderedUri, mounted]);

  if (!mounted || !renderedUri) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          bottom: Math.max(insets.bottom, 12) + 56,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={styles.toast}>
        <Image source={{ uri: renderedUri }} style={styles.thumb} resizeMode="cover" />
        <Text style={styles.message} numberOfLines={2}>
          {message}
        </Text>
        <View style={styles.checkWrap}>
          <Ionicons name="checkmark" size={18} color="#FFFFFF" />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 100,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#374151",
  },
  message: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 19,
  },
  checkWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
  },
});
