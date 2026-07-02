import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, useWindowDimensions } from "react-native";

const ON_GREEN = "#22C55E";
const OFF_TRACK = "#CBD5E1";

const SIZES = {
  sm: { width: 36, height: 20, thumb: 16, padding: 2 },
  md: { width: 42, height: 22, thumb: 18, padding: 2 },
} as const;

type Size = keyof typeof SIZES;

export function CatalogStockToggle({
  value,
  onValueChange,
  disabled,
  size = "sm",
  accessibilityLabel = "In stock",
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  size?: Size;
  accessibilityLabel?: string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const scale = Math.min(1, Math.max(0.86, screenWidth / 400));
  const base = SIZES[size];
  const dims = {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
    thumb: Math.round(base.thumb * scale),
    padding: Math.max(1, Math.round(base.padding * scale)),
  };
  const travel = dims.width - dims.padding * 2 - dims.thumb;
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: value ? 1 : 0,
      useNativeDriver: false,
      speed: 20,
      bounciness: 0,
    }).start();
  }, [value, anim]);

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [OFF_TRACK, ON_GREEN],
  });

  const thumbX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, travel],
  });

  return (
    <Pressable
      onPress={() => {
        if (!disabled) onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <Animated.View
        style={[
          styles.track,
          {
            width: dims.width,
            height: dims.height,
            borderRadius: dims.height / 2,
            padding: dims.padding,
            backgroundColor: trackColor,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.thumb,
            {
              width: dims.thumb,
              height: dims.thumb,
              borderRadius: dims.thumb / 2,
              transform: [{ translateX: thumbX }],
            },
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    justifyContent: "center",
  },
  thumb: {
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.22,
        shadowRadius: 2.5,
      },
      android: { elevation: 3 },
    }),
  },
  pressed: {
    opacity: 0.92,
  },
  disabled: {
    opacity: 0.45,
  },
});
