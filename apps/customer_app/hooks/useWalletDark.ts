import { useDiscoveryLayout } from "@/hooks/useDiscoveryLayout";
import { useWalletChromeStore } from "@/store/walletChromeStore";

/**
 * Wallet is dark only when opened from Food Home AND that food home is discovery.
 * Tabs Home / Profile / Ride always get the light wallet.
 */
export function useWalletDark(): boolean {
  const source = useWalletChromeStore((s) => s.source);
  const discovery = useDiscoveryLayout();
  return source === "food-home" && discovery;
}
