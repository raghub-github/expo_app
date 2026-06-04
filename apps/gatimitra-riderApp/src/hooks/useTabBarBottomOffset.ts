import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getRiderTabBarTotalHeight } from "@/src/lib/rider-tab-bar-layout";

/** Bottom inset for sheet content above tab bar + system navigation (sheet shell is flush to screen bottom). */
export function useTabBarBottomOffset(): number {
  const insets = useSafeAreaInsets();
  return getRiderTabBarTotalHeight(insets.bottom);
}
