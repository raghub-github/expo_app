import { useEffect } from "react";
import { enqueueInAppBanner } from "@gatimitra/expo-push-kit";

type Props = {
  visible: boolean;
  message?: string;
  onDismiss?: () => void;
};

/**
 * Compatibility wrapper — routes pickup/drop update messages through the
 * shared floating in-app banner queue (same visual language as push banners).
 */
export function PickupUpdatedBanner({
  visible,
  message = "Pickup location updated",
  onDismiss,
}: Props) {
  useEffect(() => {
    if (!visible) return;
    enqueueInAppBanner({ title: message });
    onDismiss?.();
  }, [visible, message, onDismiss]);

  return null;
}
