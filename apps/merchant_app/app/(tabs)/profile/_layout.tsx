import { useCallback } from "react";
import { Stack, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useProfileNav } from "@/context/ProfileNavContext";

/**
 * Profile stack: ProfileHome (index) is always the root.
 * Nested screens (tickets, hours, etc.) are pushed on top.
 * When the tab bar Profile button is pressed, openProfileRootOnNextFocus is set
 * and we navigate to profile root so My tickets (or any inner screen) does not stay open.
 */
export default function ProfileLayout() {
  const router = useRouter();
  const { openProfileRootOnNextFocus, setOpenProfileRootOnNextFocus } = useProfileNav();

  useFocusEffect(
    useCallback(() => {
      if (!openProfileRootOnNextFocus) return;
      setOpenProfileRootOnNextFocus(false);
      // replace once — never push, so Profile root cannot stack.
      if (router.canDismiss?.()) {
        router.dismissAll();
      }
      router.replace("/(tabs)/profile");
    }, [openProfileRootOnNextFocus, setOpenProfileRootOnNextFocus, router])
  );

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
