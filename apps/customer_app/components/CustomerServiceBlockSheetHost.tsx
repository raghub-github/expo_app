/**
 * Global host for admin service-block bottom sheet (home cards, tab bar, route gate).
 */

import { CustomerAccountBlockedBottomSheet } from "@/components/CustomerAccountBlockedBottomSheet";
import { useCustomerServiceBlockSheetStore } from "@/store/customerServiceBlockSheetStore";

export function CustomerServiceBlockSheetHost() {
  const visible = useCustomerServiceBlockSheetStore((s) => s.visible);
  const serviceLabel = useCustomerServiceBlockSheetStore((s) => s.serviceLabel);
  const reason = useCustomerServiceBlockSheetStore((s) => s.reason);
  const serviceAssetKey = useCustomerServiceBlockSheetStore((s) => s.serviceAssetKey);
  const close = useCustomerServiceBlockSheetStore((s) => s.close);

  return (
    <CustomerAccountBlockedBottomSheet
      visible={visible}
      serviceLabel={serviceLabel}
      reason={reason}
      serviceAssetKey={serviceAssetKey}
      onClose={close}
    />
  );
}
