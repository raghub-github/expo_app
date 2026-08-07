/**
 * Floating start modal → navigates to full-page raise-ticket wizard.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SupportTicketStartFloatingModal } from "@/components/support/SupportTicketStartFloatingModal";

type SupportNewTicketHostProps = {
  visible: boolean;
  onClose: () => void;
};

export function SupportNewTicketHost({ visible, onClose }: SupportNewTicketHostProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [floatingVisible, setFloatingVisible] = useState(false);

  useEffect(() => {
    if (visible) setFloatingVisible(true);
    else setFloatingVisible(false);
  }, [visible]);

  const handleClose = useCallback(() => {
    setFloatingVisible(false);
    onClose();
  }, [onClose]);

  const openFullPageWizard = useCallback(
    (step: "pick_order" | "concerns", noOrder: boolean) => {
      setFloatingVisible(false);
      onClose();
      router.push({
        pathname: "/support/raise",
        params: {
          step,
          ...(noOrder ? { noOrder: "1" } : {}),
        },
      } as never);
    },
    [onClose, router]
  );

  if (!visible && !floatingVisible) return null;

  return (
    <SupportTicketStartFloatingModal
      visible={floatingVisible}
      onClose={handleClose}
      bottomOffset={insets.bottom + 88}
      onAboutOrder={() => openFullPageWizard("pick_order", false)}
      onNotAboutOrder={() => openFullPageWizard("concerns", true)}
    />
  );
}
