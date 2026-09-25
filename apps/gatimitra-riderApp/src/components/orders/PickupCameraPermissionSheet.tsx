import { useEffect, useRef } from "react";
import { requestCameraPermission } from "@/src/lib/cameraPermission";

type Props = {
  visible: boolean;
  onGranted: () => void;
  onDismiss: () => void;
};

/**
 * Opens the Android/iOS camera permission dialog directly.
 * No custom pre-prompt sheet.
 */
export function PickupCameraPermissionSheet({ visible, onGranted, onDismiss }: Props) {
  const onGrantedRef = useRef(onGranted);
  const onDismissRef = useRef(onDismiss);
  onGrantedRef.current = onGranted;
  onDismissRef.current = onDismiss;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const result = await requestCameraPermission();
      if (cancelled) return;
      if (result.granted) onGrantedRef.current();
      else onDismissRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  return null;
}
