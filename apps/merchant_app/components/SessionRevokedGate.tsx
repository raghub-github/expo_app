import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppText as Text } from "@/components/AppText";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { useAuth } from "@/context/AuthContext";
import { GatiMitraMerchant } from "@/constants/theme";
import { authTokenFingerprint } from "@/lib/merchantAuthLog";
import { onSessionRevoked } from "@/services/sessionEvents";

type SheetState = {
  message: string;
};

export function SessionRevokedGate() {
  const { signOut, token } = useAuth();
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState | null>(null);

  useEffect(() => {
    const unsubscribe = onSessionRevoked(async (payload) => {
      // Old revoked callbacks must not destroy a newer login session.
      if (payload.tokenFingerprint && token) {
        const live = authTokenFingerprint(token);
        if (live && live !== payload.tokenFingerprint) {
          return;
        }
      }
      const message =
        payload.reason === "invalid_token"
          ? "Your login has expired or is no longer valid for this server. Please sign in again."
          : "Your session has ended. Please sign in again to access the app.";
      // Show sheet first so it survives signOut (this gate stays mounted outside auth hosts).
      setSheet({ message });
      await signOut();
    });

    return () => {
      unsubscribe();
    };
  }, [signOut, token]);

  const dismiss = useCallback(() => {
    setSheet(null);
    router.replace("/(auth)/login");
  }, [router]);

  return (
    <MerchantBottomSheetShell
      visible={sheet != null}
      onClose={dismiss}
      maxHeightPercent="42%"
      hideCloseFab
    >
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="lock-closed-outline" size={28} color={GatiMitraMerchant.primary} />
        </View>
        <Text style={styles.title}>Session ended</Text>
        <Text style={styles.message}>{sheet?.message ?? ""}</Text>
        <Pressable
          style={({ pressed }) => [styles.okBtn, pressed && styles.pressed]}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="OK"
        >
          <Text style={styles.okBtnText}>OK</Text>
        </Pressable>
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
  },
  okBtn: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  okBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.88,
  },
});
