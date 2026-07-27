import { useEffect, useMemo, useState } from "react";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { useAuth } from "@/context/AuthContext";
import { getOutlet, type OutletInfo } from "@/services/outletApi";
import {
  fetchStoreFssaiNumber,
  printContextFromSelectedStore,
  type MerchantPrintStoreContext,
} from "@/lib/printContext";

/** Shared print store context for KOT + Bill (Partner Site parity). */
export function useMerchantPrintContext(): MerchantPrintStoreContext {
  const { selectedStore } = useSelectedStore();
  const { settings } = useStoreSettings();
  const { token } = useAuth();
  const [outlet, setOutlet] = useState<OutletInfo | null>(null);
  const [fssaiNumber, setFssaiNumber] = useState<string | null>(null);

  useEffect(() => {
    const storeId = selectedStore?.id;
    const storePublicId = selectedStore?.store_id;
    const authToken = token?.trim();
    if (!storeId || !authToken) {
      setOutlet(null);
      setFssaiNumber(null);
      return;
    }

    let cancelled = false;
    setOutlet(null);
    setFssaiNumber(null);

    void getOutlet(storeId, authToken)
      .then((data) => {
        if (!cancelled) setOutlet(data);
      })
      .catch(() => {
        if (!cancelled) setOutlet(null);
      });

    if (storePublicId) {
      void fetchStoreFssaiNumber(storePublicId, authToken)
        .then((fssai) => {
          if (!cancelled) setFssaiNumber(fssai);
        })
        .catch(() => {
          if (!cancelled) setFssaiNumber(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [selectedStore?.id, selectedStore?.store_id, token]);

  return useMemo(
    () =>
      printContextFromSelectedStore(selectedStore, {
        printerWidthMm: settings.thermal_printer_width_mm,
        authToken: token,
        outlet,
        fssaiNumber,
      }),
    [selectedStore, settings.thermal_printer_width_mm, token, outlet, fssaiNumber]
  );
}
