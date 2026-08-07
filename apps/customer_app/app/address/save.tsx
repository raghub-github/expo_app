/**
 * Deep link handler — preview shared address in a bottom sheet, then save if needed.
 * URL: gatimitra://address/save?id={token}
 *      https://gatimitra.com/addr/<shortCode>?id={token}
 */

import { useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";
import { View, ActivityIndicator, StyleSheet, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useLocationStore } from "@/store/locationStore";
import {
  addressShareService,
  isSharedAddressAlreadySaved,
  type AddressSharePreview,
} from "@/services/addressShare.service";
import { addressService } from "@/services/address.service";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import {
  clearPendingAddressShareToken,
  storePendingAddressShareToken,
} from "@/lib/pendingAddressShare";
import { SharedAddressSaveSheet } from "@/components/address/SharedAddressSaveSheet";

const BRAND = "#14b8a6";

function previewErrorMessage(code: string | undefined): string {
  if (code === "already_claimed") return "This link was already used.";
  if (code === "expired") return "This link has expired.";
  if (code === "not_found") return "This address link is invalid.";
  return "Could not load this address. Please try again.";
}

export default function AddressSaveDeepLinkScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const token = typeof id === "string" ? id.trim() : "";
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const setAddressAndCoords = useLocationStore((s) => s.setAddressAndCoords);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [preview, setPreview] = useState<AddressSharePreview | null>(null);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const ranRef = useRef(false);

  const { data: savedAddresses = [] } = useQuery({
    queryKey: ["addresses"],
    queryFn: () => addressService.getAddresses(),
    enabled: !!session?.accessToken && sheetVisible,
    retry: false,
  });

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

      setLoadingPreview(true);
      setSheetVisible(true);
      try {
        const data = await addressShareService.getSharePreview(token);
        setPreview(data);
        setErrorText(null);
      } catch (e: unknown) {
        const err = e as {
          code?: string;
          response?: { status?: number; data?: { error?: string; ok?: boolean } };
        };
        const code =
          err.code ??
          (err.response?.data && "error" in err.response.data
            ? err.response.data.error
            : undefined);
        setErrorText(previewErrorMessage(code));
        setPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    })();
  }, [authHydrated, router, session?.accessToken, token]);

  useEffect(() => {
    if (!preview) return;
    setAlreadySaved(isSharedAddressAlreadySaved(savedAddresses, preview));
  }, [preview, savedAddresses]);

  const handleSave = async () => {
    if (!token || saving || alreadySaved) return;
    setSaving(true);
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

      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      await invalidateFoodHomeLocationQueries(queryClient);
      setSheetVisible(false);
      router.replace("/(tabs)");
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      const code = err.response?.data?.error;
      if (err.response?.status === 410) {
        await clearPendingAddressShareToken();
        setErrorText(previewErrorMessage(code));
      } else if (err.response?.status === 404) {
        await clearPendingAddressShareToken();
        setErrorText(previewErrorMessage("not_found"));
      } else {
        setErrorText("Could not save this address. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSheetVisible(false);
    router.replace("/(tabs)");
  };

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

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={BRAND} />
      <SharedAddressSaveSheet
        visible={sheetVisible}
        loading={loadingPreview}
        saving={saving}
        preview={preview}
        alreadySaved={alreadySaved}
        errorText={errorText}
        onClose={handleClose}
        onSave={() => void handleSave()}
      />
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
