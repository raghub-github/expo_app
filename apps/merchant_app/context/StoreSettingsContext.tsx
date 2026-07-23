import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import type { StoreSettings } from "@/services/storeSettingsApi";
import { getStoreSettings, updateStoreSettings } from "@/services/storeSettingsApi";

type StoreSettingsState = {
  show_floating_orders: boolean;
  platform_delivery: boolean;
  self_delivery: boolean;
  thermal_printer_width_mm: 58 | 80;
};

const DEFAULT_STATE: StoreSettingsState = {
  show_floating_orders: true,
  platform_delivery: true,
  self_delivery: false,
  thermal_printer_width_mm: 80,
};

type StoreSettingsContextValue = {
  settings: StoreSettingsState;
  loading: boolean;
  saving: boolean;
  refresh: () => Promise<void>;
  update: (partial: Partial<StoreSettingsState>) => Promise<void>;
};

const StoreSettingsContext = createContext<StoreSettingsContextValue | null>(null);

export function StoreSettingsProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();

  const [settings, setSettings] = useState<StoreSettingsState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!token || !selectedStore?.id) {
      setSettings(DEFAULT_STATE);
      return;
    }
    setLoading(true);
    try {
      const s: StoreSettings = await getStoreSettings(selectedStore.id, token);
      // Enforce a single active delivery mode: prefer self_delivery if both are true,
      // and fall back to platform_delivery when both are false.
      let platformDelivery = s.platform_delivery;
      let selfDelivery = s.self_delivery;
      if (platformDelivery && selfDelivery) {
        platformDelivery = false;
        selfDelivery = true;
      } else if (!platformDelivery && !selfDelivery) {
        platformDelivery = true;
        selfDelivery = false;
      }
      setSettings({
        show_floating_orders: s.show_floating_orders !== false,
        platform_delivery: platformDelivery,
        self_delivery: selfDelivery,
        thermal_printer_width_mm: s.thermal_printer_width_mm === 58 ? 58 : 80,
      });
    } catch {
      setSettings(DEFAULT_STATE);
    } finally {
      setLoading(false);
    }
  }, [token, selectedStore?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (partial: Partial<StoreSettingsState>) => {
      if (!token || !selectedStore?.id) return;
      const next: StoreSettingsState = { ...settings, ...partial };
      setSettings(next);
      setSaving(true);
      try {
        const body: Partial<StoreSettings> = {
          show_floating_orders: next.show_floating_orders,
          platform_delivery: next.platform_delivery,
          self_delivery: next.self_delivery,
        };
        const updated = await updateStoreSettings(selectedStore.id, body, token);
        setSettings({
          show_floating_orders: updated.show_floating_orders !== false,
          platform_delivery: updated.platform_delivery,
          self_delivery: updated.self_delivery,
          thermal_printer_width_mm: updated.thermal_printer_width_mm === 58 ? 58 : 80,
        });
      } catch {
        // On failure, reload from backend to keep state consistent.
        void load();
      } finally {
        setSaving(false);
      }
    },
    [token, selectedStore?.id, settings, load]
  );

  const value = useMemo<StoreSettingsContextValue>(
    () => ({
      settings,
      loading,
      saving,
      refresh: load,
      update,
    }),
    [settings, loading, saving, load, update]
  );

  return <StoreSettingsContext.Provider value={value}>{children}</StoreSettingsContext.Provider>;
}

export function useStoreSettings(): StoreSettingsContextValue {
  const ctx = useContext(StoreSettingsContext);
  if (!ctx) {
    throw new Error("useStoreSettings must be used within StoreSettingsProvider");
  }
  return ctx;
}

