import { useRiderBottomDock } from "@/src/hooks/useRiderBottomDock";

/** Bottom inset for sheet content above tab bar + system navigation. */
export function useTabBarBottomOffset(): number {
  const { tabBarHeight } = useRiderBottomDock({ tabBarVisible: true });
  return tabBarHeight;
}
