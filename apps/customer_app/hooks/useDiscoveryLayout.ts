import { useFoodHomeLayout } from "@/hooks/useFoodHomeLayout";
import { useLocationStore } from "@/store/locationStore";

/** True when super-admin food home layout for this area is discovery (dark). */
export function useDiscoveryLayout(): boolean {
  const address = useLocationStore((s) => s.address);
  const coords = useLocationStore((s) => s.coords);
  const { layoutKey, cachedLayoutKey } = useFoodHomeLayout(address, coords);
  return (layoutKey ?? cachedLayoutKey) === "discovery";
}
