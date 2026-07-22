/**
 * Modal asking user to enable contacts permission (e.g. for Add a guest).
 * Same wave-header sheet design as SMS permission — texts/icons unchanged.
 */

import { Linking, Platform } from "react-native";
import { PermissionPromptBottomSheet } from "@/components/permissions/PermissionPromptBottomSheet";

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function ContactsPermissionModal({ visible, onDismiss }: Props) {
  const openSettings = () => {
    if (Platform.OS === "ios") {
      void Linking.openURL("app-settings:");
    } else {
      void Linking.openSettings();
    }
    onDismiss();
  };

  return (
    <PermissionPromptBottomSheet
      visible={visible}
      icon="people"
      title="Allow contacts access"
      message="GatiMitra needs access to your contacts so you can quickly add a guest for the ride."
      allowLabel="Open Settings"
      skipLabel="Not now"
      onAllow={openSettings}
      onSkip={onDismiss}
    />
  );
}
