import { Redirect } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";

export default function Index() {
  const { authState, isAuthenticated } = useAuth();
  const { selectedStore, isStoreReady } = useSelectedStore();

  if (authState.status === "loading" || (isAuthenticated && !isStoreReady)) {
    return <MerchantBootstrapScreen />;
  }

  if (authState.status === "unauthenticated") {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (selectedStore) {
    return <Redirect href="/(tabs)" />;
  }
  return <Redirect href="/(auth)/partner-home" />;
}
