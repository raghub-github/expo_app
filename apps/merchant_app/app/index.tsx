import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

export default function Index() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { selectedStore, isStoreReady } = useSelectedStore();

  if (authLoading || (isAuthenticated && !isStoreReady)) {
    return <MerchantBootstrapScreen />;
  }

  if (isAuthenticated) {
    if (selectedStore) {
      return <Redirect href="/(tabs)" />;
    }
    return <Redirect href="/(auth)/partner-home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}
