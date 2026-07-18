/**
 * React Native type augmentation.
 *
 * RN 0.81's shipped type declarations dropped a handful of long-standing
 * props from `PressableProps` and `ScrollViewProps` even though the runtime
 * still honors them. Rather than removing dozens of call sites (`delayPressIn={0}`
 * is redundant next to `unstable_pressDelay={0}` but harmless, and
 * `delaysContentTouches={false}` is iOS-only but still valid), we declare
 * them back here so tsc stops flagging valid code.
 *
 * If a future RN release actually removes these at runtime, the failing
 * runtime warnings will alert us — this file is a bridge, not a permanent
 * shim.
 */
import "react-native";

declare module "react-native" {
  interface PressableProps {
    /** Legacy prop replaced by `unstable_pressDelay`. Runtime still supports
     *  it in RN 0.81; type shipped without it. */
    delayPressIn?: number;
  }
  interface ScrollViewProps {
    /** iOS-only. Delays touch handling within scroll view content. */
    delaysContentTouches?: boolean;
  }
}
