import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { PermissionBottomSheetShell } from "@/src/components/permissions/PermissionBottomSheetShell";
import { usePaymentSuccessSheetStore } from "@/src/stores/paymentSuccessSheetStore";
import { colors } from "@/src/theme";
import { LORA_BOLD, POPPINS_BOLD, POPPINS_SEMIBOLD } from "@/src/theme/headerFonts";

const TEAL = colors.primary[600];

/** Replaces the dark system Alert after dues / penalty / wallet payments. */
export function RiderPaymentSuccessSheet() {
  const { t } = useTranslation();
  const visible = usePaymentSuccessSheetStore((s) => s.visible);
  const title = usePaymentSuccessSheetStore((s) => s.title);
  const message = usePaymentSuccessSheetStore((s) => s.message);
  const hide = usePaymentSuccessSheetStore((s) => s.hide);

  return (
    <PermissionBottomSheetShell
      visible={visible}
      dismissible
      onDismiss={hide}
      maxHeightRatio={0.58}
    >
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="checkmark-circle" size={48} color={TEAL} />
        </View>
        <Text style={styles.title}>{title || t("subscription.duesPaidTitle", "Payment successful")}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={hide}
          accessibilityRole="button"
          accessibilityLabel={t("common.ok", "OK")}
        >
          <Text style={styles.btnText}>{t("common.ok", "OK")}</Text>
        </Pressable>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: "rgba(13, 148, 136, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: POPPINS_SEMIBOLD,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
    marginBottom: 20,
  },
  btn: {
    width: "100%",
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: {
    opacity: 0.88,
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: POPPINS_BOLD,
    fontWeight: "700",
  },
});
