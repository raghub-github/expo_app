import React, { useState } from "react";
import { View, Text, ScrollView, Linking, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { usePermissionStore } from "@/src/stores/permissionStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function BatteryOptimizationScreen() {
  const { t } = useTranslation();
  const setHasRequestedPermissions = usePermissionStore((s) => s.setHasRequestedPermissions);
  const [loading, setLoading] = useState(false);

  const handleAllow = async () => {
    setLoading(true);
    try {
      // On Android, open battery optimization settings
      if (Platform.OS === "android") {
        try {
          // Try to open battery optimization settings
          await Linking.openSettings();
        } catch (error) {
          console.warn("Failed to open settings:", error);
          // Continue anyway
        }
      }
      
      // Mark permissions as requested and proceed
      await setHasRequestedPermissions(true);
      router.replace("/(auth)/login");
    } catch (error) {
      console.warn("Error in battery optimization:", error);
      // Continue anyway
      await setHasRequestedPermissions(true);
      router.replace("/(auth)/login");
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    // Allow user to skip but show warning
    Alert.alert(
      "Battery Optimization",
      "Disabling battery optimization may affect app performance and order notifications. You can enable it later in settings.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Continue Anyway",
          onPress: async () => {
            await setHasRequestedPermissions(true);
            router.replace("/(auth)/login");
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 24, fontWeight: "bold", color: "#111827", marginBottom: 8 }}>
            {t("permissions.battery.title", "Disable Battery Optimization")}
          </Text>
          <Text style={{ fontSize: 16, color: "#6B7280", lineHeight: 24 }}>
            {t(
              "permissions.battery.description",
              "To ensure continuous location tracking and order updates, please allow this app to always run in the background."
            )}
          </Text>
        </View>

        {/* Progress Indicator */}
        <View style={{ marginBottom: 32, flexDirection: "row", alignItems: "center", gap: 8 }}>
          {[1, 2, 3, 4, 5].map((step) => (
            <View
              key={step}
              style={{
                flex: 1,
                height: 4,
                backgroundColor: step <= 4 ? colors.primary[500] : "#E5E7EB",
                borderRadius: 2,
              }}
            />
          ))}
        </View>

        {/* Content Card */}
        <View
          style={{
            backgroundColor: "#F9FAFB",
            borderRadius: 16,
            padding: 24,
            marginBottom: 32,
            alignItems: "center",
          }}
        >
          {/* Battery Icon */}
          <View
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              backgroundColor: colors.primary[100],
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Text style={{ fontSize: 40 }}>🔋</Text>
          </View>

          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: "#111827",
              marginBottom: 16,
              textAlign: "center",
            }}
          >
            {t("permissions.battery.question", "Stop optimising battery usage?")}
          </Text>

          <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20 }}>
            {t(
              "permissions.battery.details",
              "This will allow GatiMitra to run efficiently in the background and ensure you receive order notifications on time."
            )}
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ flex: 1, justifyContent: "flex-end", gap: 12 }}>
          <Button onPress={handleAllow} loading={loading} disabled={loading} size="lg">
            {t("permissions.battery.allow", "Allow")}
          </Button>

          <Button variant="ghost" onPress={handleDeny} disabled={loading} size="lg">
            {t("permissions.battery.deny", "Deny")}
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

