import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { isFoodHomeListScrollActive } from "@/lib/foodHomeScrollGuard";

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
  pressedOpacity?: number;
};

const PRESS_IN_MS = 90;
const PRESS_OUT_MS = 140;
const PRESS_EASING = Easing.out(Easing.quad);

/**
 * UI-thread press scale for cards that keep their own Pressable.
 * Do NOT put transform on the Pressable itself (Android layout bugs).
 */
export function useInstantPressScale(pressedScale = 0.98) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pressIn = () => {
    if (isFoodHomeListScrollActive()) return;
    scale.value = withTiming(pressedScale, { duration: PRESS_IN_MS, easing: PRESS_EASING });
  };

  const pressOut = () => {
    scale.value = withTiming(1, { duration: PRESS_OUT_MS, easing: PRESS_EASING });
  };

  return { style, pressIn, pressOut };
}

/**
 * Instant tap feedback without stealing layout from children.
 * Style stays on Pressable; scale wrapper only applies transform.
 */
export function InstantPressable({
  style,
  pressedScale = 0.98,
  pressedOpacity = 1,
  android_ripple,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...rest
}: Props) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={animStyle} collapsable={false}>
      <Pressable
        collapsable={false}
        unstable_pressDelay={0}
        disabled={disabled}
        android_ripple={
          android_ripple === undefined
            ? { color: "rgba(15, 23, 42, 0.08)", foreground: false }
            : android_ripple ?? undefined
        }
        style={style}
        onPressIn={(e) => {
          if (!disabled && !isFoodHomeListScrollActive()) {
            scale.value = withTiming(pressedScale, {
              duration: PRESS_IN_MS,
              easing: PRESS_EASING,
            });
            if (pressedOpacity < 1) {
              opacity.value = withTiming(pressedOpacity, {
                duration: PRESS_IN_MS,
                easing: PRESS_EASING,
              });
            }
          }
          onPressIn?.(e);
        }}
        onPressOut={(e) => {
          scale.value = withTiming(1, { duration: PRESS_OUT_MS, easing: PRESS_EASING });
          opacity.value = withTiming(1, { duration: PRESS_OUT_MS, easing: PRESS_EASING });
          onPressOut?.(e);
        }}
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
