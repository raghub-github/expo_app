/**
 * Legacy Waiting-for-Review full page — always bounce to home.
 * Message + actions live in WaitingForReviewSheet on the home tabs.
 */
import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";

export default function PendingScreen() {
  useEffect(() => {
    router.replace("/(tabs)/orders");
  }, []);

  return (
    <View style={styles.boot}>
      <ActivityIndicator size="large" color="#22a745" />
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f4fbf6",
  },
});
