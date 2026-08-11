import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useProfileNav } from "@/context/ProfileNavContext";
import { TypographyVariantProvider } from "@/lib/typographyVariant";

/**
 * Profile stack: ProfileHome (index) is always the root.
 * Nested screens (tickets, hours, etc.) are pushed on top.
 * When the tab bar Profile button is pressed, openProfileRootOnNextFocus is set
 * and we navigate to profile root so My tickets (or any inner screen) does not stay open.
 */
export default function ProfileLayout() {
  const router = useRouter();
  const { openProfileRootOnNextFocus, setOpenProfileRootOnNextFocus, setLastProfileSlug, clearReturnRoute } = useProfileNav();

  useFocusEffect(
    useCallback(() => {
      if (!openProfileRootOnNextFocus) return;
      setOpenProfileRootOnNextFocus(false);
      setLastProfileSlug(null);
      clearReturnRoute();
      if (router.canDismiss?.()) {
        router.dismissAll();
      }
      router.replace("/(tabs)/profile");
    }, [openProfileRootOnNextFocus, setOpenProfileRootOnNextFocus, setLastProfileSlug, clearReturnRoute, router])
  );

  return (
    <TypographyVariantProvider variant="sans">
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      />
    </TypographyVariantProvider>
  );
}
