import { useMemo } from "react";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { printContextFromSelectedStore, type MerchantPrintStoreContext } from "@/lib/printContext";

/** Shared print store context for KOT + Bill (Partner Site parity). */
export function useMerchantPrintContext(): MerchantPrintStoreContext {
  const { selectedStore } = useSelectedStore();
  const { settings } = useStoreSettings();

  return useMemo(
    () =>
      printContextFromSelectedStore(selectedStore, {
        printerWidthMm: settings.thermal_printer_width_mm,
      }),
    [selectedStore, settings.thermal_printer_width_mm]
  );
}
