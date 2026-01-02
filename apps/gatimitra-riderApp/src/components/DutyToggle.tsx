import React from "react";
import { View, Text, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useDutyStore } from "@/src/stores/dutyStore";
import { useMutation } from "@tanstack/react-query";
import { riderApi } from "@/src/services/api/riderApi";
import { colors } from "@/src/theme";

export function DutyToggle() {
  const { t } = useTranslation();
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const toggleDuty = useDutyStore((s) => s.toggleDuty);

  const updateDutyMutation = useMutation({
    mutationFn: (status: boolean) => riderApi.updateDutyStatus(status),
    onSuccess: () => {
      // Duty status updated on backend
    },
    onError: (error) => {
      console.error("Failed to update duty status:", error);
      // Revert local state on error
      void toggleDuty();
    },
  });

  const handleToggle = async () => {
    const newStatus = !isOnDuty;
    await toggleDuty();
    updateDutyMutation.mutate(newStatus);
  };

  return (
    <View className="flex-row items-center gap-3">
      <Text className="text-sm font-medium text-gray-700">
        {isOnDuty ? t("topbar.dutyOn") : t("topbar.dutyOff")}
      </Text>
      <Pressable
        onPress={handleToggle}
        disabled={updateDutyMutation.isPending}
        className={`w-14 h-7 rounded-full ${
          isOnDuty ? "bg-success-500" : "bg-gray-300"
        } justify-center transition-all`}
        style={{
          paddingHorizontal: 3,
        }}
      >
        <View
          className="w-6 h-6 rounded-full bg-white shadow-sm"
          style={{
            transform: [{ translateX: isOnDuty ? 28 : 0 }],
          }}
        />
      </Pressable>
    </View>
  );
}

