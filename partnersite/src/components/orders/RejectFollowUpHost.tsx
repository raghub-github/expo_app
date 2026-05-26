'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type { MerchantCancellationReason } from '@/lib/merchantCancellationReasons';
import {
  isItemsOutOfStockReason,
  isNotOperationalTodayReason,
} from '@/lib/merchantCancellationReasons';
import type { NormalizedOrderLineItem } from '@/lib/orderLineItems';
import type { RejectPickItem } from '@/lib/rejectOrderPickItems';
import {
  StoreOperationalFlowModals,
  type StoreOperationalTarget,
} from '@/components/StoreOperationalFlowModals';
import { RejectOrderItemsPickSidesheet } from '@/components/orders/RejectOrderItemsPickSidesheet';
import { MenuItemOutOfStockSidesheet } from '@/components/orders/MenuItemOutOfStockSidesheet';

type FinalizeReject = () => void | Promise<void>;

type FollowUpState =
  | { kind: 'store_close'; target: StoreOperationalTarget; finalizeReject: FinalizeReject }
  | { kind: 'items_pick'; lineItems: NormalizedOrderLineItem[]; finalizeReject: FinalizeReject }
  | { kind: 'items_oos'; items: RejectPickItem[]; finalizeReject: FinalizeReject }
  | null;

export type BeginRejectFollowUpOpts = {
  storeId: string;
  storeName: string;
  lineItems: NormalizedOrderLineItem[];
  /** Called only after user completes the follow-up flow (not on dismiss). */
  finalizeReject: FinalizeReject;
};

export function useRejectFollowUp() {
  const [followUp, setFollowUp] = useState<FollowUpState>(null);

  const beginFollowUp = useCallback(
    (reason: MerchantCancellationReason, opts: BeginRejectFollowUpOpts) => {
      const { finalizeReject, lineItems, storeId, storeName } = opts;
      if (isNotOperationalTodayReason(reason)) {
        setFollowUp({
          kind: 'store_close',
          target: { storeId, storeName },
          finalizeReject,
        });
        return;
      }
      if (isItemsOutOfStockReason(reason)) {
        setFollowUp({ kind: 'items_pick', lineItems, finalizeReject });
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
  } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Could not cancel order');
  }
}

export function RejectFollowUpHost({
  followUp,
  storeId,
  onDismiss,
  setFollowUp,
}: {
  followUp: FollowUpState;
  storeId: string;
  onDismiss: () => void;
  setFollowUp: React.Dispatch<React.SetStateAction<FollowUpState>>;
}) {
  if (!followUp) return null;

  if (followUp.kind === 'store_close') {
    return (
      <StoreOperationalFlowModals
        closeTarget={followUp.target}
        openTarget={null}
        initialClosureType="today"
        onDismissClose={onDismiss}
        onDismissOpen={onDismiss}
        onSuccess={async () => {
          await finalizeAndDismiss(followUp.finalizeReject, onDismiss);
        }}
      />
    );
  }

  if (followUp.kind === 'items_pick') {
    return (
      <RejectOrderItemsPickSidesheet
        open
        lineItems={followUp.lineItems}
        onClose={onDismiss}
        onContinue={(selected) => {
          if (selected.length === 0) {
            onDismiss();
            return;
          }
          setFollowUp({
            kind: 'items_oos',
            items: selected,
            finalizeReject: followUp.finalizeReject,
          });
        }}
      />
    );
  }

  return (
    <MenuItemOutOfStockSidesheet
      open
      items={followUp.items}
      storeId={storeId}
      onClose={onDismiss}
      onSuccess={() => void finalizeAndDismiss(followUp.finalizeReject, onDismiss)}
    />
  );
}
