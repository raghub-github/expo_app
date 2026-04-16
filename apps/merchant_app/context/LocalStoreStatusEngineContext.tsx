import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  UI_STRINGS,
  createInitialStoreStatusState,
  reduceStoreStatusEngine,
  type StoreStatusEngineEffect,
  type StoreStatusEngineState,
} from "@/lib/storeStatusEngine";

const CACHE_KEY_PREFIX = "local_store_status_engine_";
const TICK_MS = 5_000;

type Ctx = {
  state: StoreStatusEngineState;
  manualOn: () => void;
  manualOff: () => void;
  scheduleEndRespond: (action: "stay_online" | "go_offline") => void;
  updateConfig: (patch: Partial<StoreStatusEngineState>) => void;
};

const LocalStoreStatusEngineContext = createContext<Ctx | null>(null);

function applyEffects(effects: StoreStatusEngineEffect[], opts: { showScheduleEndModal: () => void; toast?: (m: string) => void }) {
  for (const e of effects) {
    if (e.type === "schedule_end_modal") opts.showScheduleEndModal();
    if (e.type === "toast" && e.level === "info") opts.toast?.(e.message);
    if (e.type === "toast" && e.level === "error") opts.toast?.(e.message);
  }
}

export function LocalStoreStatusEngineProvider({ children }: { children: ReactNode }) {
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;
  const [state, setState] = useState<StoreStatusEngineState>(() => createInitialStoreStatusState());
  const lastPromptKeyRef = useRef<string | null>(null);

  const cacheKey = useMemo(() => (storeId ? `${CACHE_KEY_PREFIX}${storeId}` : null), [storeId]);

  // Load persisted state
  useEffect(() => {
    if (!cacheKey) return;
    SecureStore.getItemAsync(cacheKey)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as StoreStatusEngineState;
          if (parsed && typeof parsed === "object" && (parsed.store_status === "ONLINE" || parsed.store_status === "OFFLINE")) {
            setState({ ...createInitialStoreStatusState(), ...parsed });
          }
        } catch {
          // ignore
        }
      })
      .catch(() => {});
  }, [cacheKey]);

  const persist = useCallback(
    (next: StoreStatusEngineState) => {
      if (!cacheKey) return;
      SecureStore.setItemAsync(cacheKey, JSON.stringify(next)).catch(() => {});
    },
    [cacheKey]
  );

  const showScheduleEndModal = useCallback(() => {
    const exp = state.schedule_end_prompt_expires_at;
    if (!exp) return;
    if (lastPromptKeyRef.current === exp) return;
    lastPromptKeyRef.current = exp;
    Alert.alert(UI_STRINGS.scheduleEndTitle, UI_STRINGS.scheduleEndBody, [
      { text: "Go Offline", style: "destructive", onPress: () => scheduleEndRespond("go_offline") },
      { text: "Stay Online", onPress: () => scheduleEndRespond("stay_online") },
    ]);
  }, [state.schedule_end_prompt_expires_at]);

  const dispatch = useCallback(
    (event: Parameters<typeof reduceStoreStatusEngine>[1]) => {
      setState((prev) => {
        const { state: next, effects } = reduceStoreStatusEngine(prev, event as any);
        if (effects.some((e) => e.type === "persist")) persist(next);
        applyEffects(effects, { showScheduleEndModal });
        return next;
      });
    },
    [persist, showScheduleEndModal]
  );

  const manualOn = useCallback(() => dispatch({ type: "MANUAL_ON", now: new Date() }), [dispatch]);
  const manualOff = useCallback(() => dispatch({ type: "MANUAL_OFF", now: new Date() }), [dispatch]);
  const scheduleEndRespond = useCallback(
    (action: "stay_online" | "go_offline") => dispatch({ type: "SCHEDULE_END_RESPONSE", now: new Date(), action }),
    [dispatch]
  );
  const updateConfig = useCallback(
    (patch: Partial<StoreStatusEngineState>) => dispatch({ type: "CONFIG_UPDATE", now: new Date(), patch }),
    [dispatch]
  );

  // Tick loop
  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "TICK", now: new Date() }), TICK_MS);
    return () => clearInterval(id);
  }, [dispatch]);

  const value: Ctx = useMemo(
    () => ({ state, manualOn, manualOff, scheduleEndRespond, updateConfig }),
    [state, manualOn, manualOff, scheduleEndRespond, updateConfig]
  );

  return <LocalStoreStatusEngineContext.Provider value={value}>{children}</LocalStoreStatusEngineContext.Provider>;
}

export function useLocalStoreStatusEngine(): Ctx {
  const ctx = useContext(LocalStoreStatusEngineContext);
  if (!ctx) throw new Error("useLocalStoreStatusEngine must be used within LocalStoreStatusEngineProvider");
  return ctx;
}

