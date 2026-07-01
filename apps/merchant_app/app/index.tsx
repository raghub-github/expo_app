import { Redirect } from "expo-router";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";

export default function Index() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { selectedStore, isStoreReady } = useSelectedStore();

  if (authLoading || (isAuthenticated && !isStoreReady)) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  }

  if (isAuthenticated) {
    if (selectedStore) {
      return <Redirect href="/(tabs)" />;
    }
    return <Redirect href="/(auth)/partner-home" />;
  }

  return <Redirect href="/(auth)/welcome" />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: "#64748B",
  },
});
