/**
 * Deep link handler — save a shared delivery address and refresh services.
 * URL: gatimitra://address/save?id={token}
 */

import { useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ActivityIndicator, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useLocationStore } from "@/store/locationStore";
import { addressShareService } from "@/services/addressShare.service";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import {
  clearPendingAddressShareToken,
  storePendingAddressShareToken,
} from "@/lib/pendingAddressShare";
const BRAND = "#14b8a6";

export default function AddressSaveDeepLinkScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const token = typeof id === "string" ? id.trim() : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const setAddressAndCoords = useLocationStore((s) => s.setAddressAndCoords);
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [errorText, setErrorText] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (!token || ranRef.current) return;
    if (!authHydrated) return;

    ranRef.current = true;

    void (async () => {
      if (!session?.accessToken) {
        await storePendingAddressShareToken(token);
        router.replace("/(auth)/login");
        return;
      }

      try {
        const result = await addressShareService.claimShareLink(token);
        await clearPendingAddressShareToken();

        const primary = result.label?.trim() || "Shared address";
        setAddressAndCoords(
          {
            primary,
            secondary: result.fullAddress.slice(0, 80),
            fullAddress: result.fullAddress,
          },
          { latitude: result.latitude, longitude: result.longitude },
          { source: "selected" }
        );

        await invalidateFoodHomeLocationQueries(queryClient);
        setStatus("done");
        Alert.alert(
          "Address saved",
          "Delivery location updated. Showing services for this area.",
          [{ text: "OK", onPress: () => router.replace("/(tabs)") }]
        );
      } catch (e: unknown) {
        const err = e as { response?: { status?: number; data?: { error?: string } } };
        const code = err.response?.data?.error;
        if (err.response?.status === 410) {
          await clearPendingAddressShareToken();
          setErrorText(
            code === "already_claimed"
              ? "This link was already used."
              : "This link has expired."
          );
        } else if (err.response?.status === 404) {
          await clearPendingAddressShareToken();
          setErrorText("This address link is invalid.");
        } else {
          setErrorText("Could not save this address. Please try again.");
        }
        setStatus("error");
      }
    })();
  }, [authHydrated, queryClient, router, session?.accessToken, setAddressAndCoords, token]);

  if (!token) {
    return (
      <View style={styles.center}>
        <AppText style={styles.error}>Invalid address link</AppText>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/(tabs)")}>
          <AppText style={styles.btnText}>Go to home</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  if (status === "error") {
    return (
      <View style={styles.center}>
        <AppText style={styles.error}>{errorText ?? "Something went wrong"}</AppText>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace("/(tabs)")}>
          <AppText style={styles.btnText}>Go to home</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={BRAND} />
      <AppText style={styles.loading}>Saving delivery address…</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  loading: {
    marginTop: 16,
    fontSize: 16,
    color: "#64748b",
  },
  error: {
    fontSize: 16,
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 20,
  },
  btn: {
    backgroundColor: BRAND,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
});
