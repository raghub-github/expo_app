// @refresh reset
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PROFILE_CARD_RADIUS } from "@/src/components/profile/ProfilePromoCard";
import { colors } from "@/src/theme";

type ProfileLogoutRowProps = {
  onPress: () => void;
};

export function ProfileLogoutRow({ onPress }: ProfileLogoutRowProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t("profile.logout")}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressablePressed]}
      >
        <View style={styles.rowInner}>
          <View style={styles.iconWrap}>
            <Ionicons name="log-out-outline" size={20} color={colors.error[600]} />
          </View>
          <Text style={styles.label} numberOfLines={1}>
            {t("profile.logout")}
          </Text>
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const ICON = 40;
const HPAD = 16;

const styles = StyleSheet.create({
  card: {
    width: "100%",
    alignSelf: "stretch",
    borderRadius: PROFILE_CARD_RADIUS,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  pressable: {
    width: "100%",
    alignSelf: "stretch",
  },
  pressablePressed: {
    backgroundColor: "#FEF2F2",
  },
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: HPAD,
    paddingVertical: 14,
  },
  iconWrap: {
    width: ICON,
    height: ICON,
    borderRadius: 11,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  label: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    fontSize: 15,
    fontWeight: "600",
    color: colors.error[600],
    lineHeight: 20,
  },
  chevronWrap: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
