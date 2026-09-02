import { useCallback, useState } from "react";
import { Alert } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { MerchantCancellationReason } from "@/lib/merchantCancellationReasons";
import {
  isItemsOutOfStockReason,
  isNotOperationalTodayReason,
} from "@/lib/merchantCancellationReasons";
import type { LineItem } from "@/hooks/useOrders";
import type { RejectPickItem } from "@/lib/rejectOrderPickItems";
import { RejectOrderItemsPickSheet } from "@/components/order/RejectOrderItemsPickSheet";
import { RejectStoreCloseSheet } from "@/components/order/RejectStoreCloseSheet";
import { OutOfStockModal, type OutOfStockPayload } from "@/components/OutOfStockModal";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { patchItemOutOfStock } from "@/services/menuApi";
import { menuKeys } from "@/hooks/useMenuQueries";

type FinalizeReject = () => void | Promise<void>;

type FollowUpState =
  | { kind: "store_close"; finalizeReject: FinalizeReject }
  | { kind: "items_pick"; lineItems: LineItem[]; finalizeReject: FinalizeReject }
  | { kind: "items_oos"; items: RejectPickItem[]; finalizeReject: FinalizeReject }
  | null;

export function useRejectFollowUp() {
  const [followUp, setFollowUp] = useState<FollowUpState>(null);

  const beginFollowUp = useCallback(
    (
      reason: MerchantCancellationReason,
      lineItems: LineItem[],
      finalizeReject: FinalizeReject
    ) => {
      if (isNotOperationalTodayReason(reason)) {
        setFollowUp({ kind: "store_close", finalizeReject });
        return;
      }
      if (isItemsOutOfStockReason(reason)) {
        setFollowUp({ kind: "items_pick", lineItems, finalizeReject });
      }
    },
    []
  );

  const dismissFollowUp = useCallback(() => setFollowUp(null), []);

  return { followUp, beginFollowUp, dismissFollowUp, setFollowUp };
}

async function finalizeAndDismiss(
  finalizeReject: FinalizeReject,
  onDismiss: () => void
): Promise<void> {
  try {
    await finalizeReject();
    onDismiss();
  } catch {
    Alert.alert("Could not cancel order", "Please try again.");
  }
}

export function RejectFollowUpHost({
  followUp,
  onDismiss,
  setFollowUp,
}: {
  followUp: FollowUpState;
  onDismiss: () => void;
  setFollowUp: React.Dispatch<React.SetStateAction<FollowUpState>>;
}) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const queryClient = useQueryClient();
  const storeId = selectedStore?.id ?? null;
  const [oosBusy, setOosBusy] = useState(false);

  if (!followUp) return null;

  if (followUp.kind === "store_close") {
    return (
      <RejectStoreCloseSheet
        visible
        onClose={onDismiss}
        onAfterClose={() => finalizeAndDismiss(followUp.finalizeReject, onDismiss)}
      />
    );
  }

  if (followUp.kind === "items_pick") {
    return (
      <RejectOrderItemsPickSheet
        visible
        lineItems={followUp.lineItems}
        onClose={onDismiss}
        onContinue={(selected) => {
          if (selected.length === 0) {
            void finalizeAndDismiss(followUp.finalizeReject, onDismiss);
            return;
          }
          setFollowUp({
            kind: "items_oos",
            items: selected,
            finalizeReject: followUp.finalizeReject,
          });
        }}
      />
    );
  }

  const title =
    followUp.items.length === 1
      ? followUp.items[0].name
      : `${followUp.items.length} items selected`;

  const confirmOos = async (payload: OutOfStockPayload) => {
    if (!storeId || !token) {
      await finalizeAndDismiss(followUp.finalizeReject, onDismiss);
      return;
    }
    setOosBusy(true);
    try {
      const results = await Promise.allSettled(
        followUp.items.map((item) =>
          patchItemOutOfStock(String(storeId), item.menuItemId, token, payload)
        )
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        Alert.alert(
          "Some items not updated",
          "Order will still be cancelled. You can mark stock from Menu if needed."
        );
      }
      const storeIdStr = String(storeId);
      void queryClient.invalidateQueries({ queryKey: menuKeys.items(storeIdStr) });
      for (const item of followUp.items) {
        void queryClient.invalidateQueries({
          queryKey: menuKeys.item(storeIdStr, item.menuItemId),
        });
      }
    } catch {
      Alert.alert(
        "Could not update stock",
        "Order will still be cancelled. You can mark stock from Menu if needed."
      );
    } finally {
      setOosBusy(false);
      await finalizeAndDismiss(followUp.finalizeReject, onDismiss);
    }
  };

  return (
    <OutOfStockModal
      visible
      title="Mark out of stock"
      subtitle={title}
      helperText="Customers won't be able to order these items until you mark them back in stock."
      confirmLabel="Confirm"
      busy={oosBusy}
      onClose={onDismiss}
      onConfirm={(payload) => void confirmOos(payload)}
    />
  );
}
