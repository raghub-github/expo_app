import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import {
  newRiderActionId,
  type RiderActionPhase,
  type RiderActionType,
} from "@/src/lib/rider-action-kind";
import { isRiderActionExpired } from "@/src/lib/rider-pending-action-ttl";

export { isRiderActionExpired, riderActionTtlMs } from "@/src/lib/rider-pending-action-ttl";

const STORAGE_KEY = "gm.rider.pendingActions.v1";
const MAX_ACTIONS = 8;

function prune(actions: PendingRiderAction[], now = Date.now()): PendingRiderAction[] {
  return actions.filter((a) => a && !isRiderActionExpired(a, now));
}

export type PendingRiderAction = {
  actionId: string;
  actionType: RiderActionType;
  orderId: string;
  /** Non-secret request fields only (gps, otp digits). Never store tokens. */
  payload: Record<string, unknown>;
  phase: RiderActionPhase;
  createdAt: number;
  lastAttemptAt: number;
  retryCount: number;
};

type Store = {
  hydrated: boolean;
  actions: PendingRiderAction[];
  hydrate: () => Promise<void>;
  upsert: (action: PendingRiderAction) => void;
  getOrCreate: (
    orderId: string,
    actionType: RiderActionType,
    payload: Record<string, unknown>
  ) => PendingRiderAction;
  update: (actionId: string, patch: Partial<PendingRiderAction>) => void;
  remove: (actionId: string) => void;
  removeByOrderAction: (orderId: string, actionType: RiderActionType) => void;
  getByOrderAction: (orderId: string, actionType: RiderActionType) => PendingRiderAction | null;
};

function persist(actions: PendingRiderAction[]): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(actions.slice(-MAX_ACTIONS))).catch(() => {});
}

export const useRiderPendingActionStore = create<Store>((set, get) => ({
  hydrated: false,
  actions: [],
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as PendingRiderAction[]) : [];
      const kept = Array.isArray(parsed) ? prune(parsed).slice(-MAX_ACTIONS) : [];
      set({ hydrated: true, actions: kept });
      if (Array.isArray(parsed) && kept.length !== parsed.length) persist(kept);
    } catch {
      set({ hydrated: true, actions: [] });
    }
  },
  upsert: (action) => {
    const next = get()
      .actions.filter(
        (a) => !(a.orderId === action.orderId && a.actionType === action.actionType)
      )
      .concat(action)
      .slice(-MAX_ACTIONS);
    set({ actions: next });
    persist(next);
  },
  getOrCreate: (orderId, actionType, payload) => {
    const existing = get()
      .actions.filter((a) => !isRiderActionExpired(a))
      .find((a) => a.orderId === orderId && a.actionType === actionType);
    if (existing) {
      const merged = {
        ...existing,
        payload: { ...existing.payload, ...payload },
        lastAttemptAt: Date.now(),
      };
      get().upsert(merged);
      return merged;
    }
    const created: PendingRiderAction = {
      actionId: newRiderActionId(),
      actionType,
      orderId,
      payload,
      phase: "processing",
      createdAt: Date.now(),
      lastAttemptAt: Date.now(),
      retryCount: 0,
    };
    get().upsert(created);
    return created;
  },
  update: (actionId, patch) => {
    const next = get().actions.map((a) => (a.actionId === actionId ? { ...a, ...patch } : a));
    set({ actions: next });
    persist(next);
  },
  remove: (actionId) => {
    const next = get().actions.filter((a) => a.actionId !== actionId);
    set({ actions: next });
    persist(next);
  },
  removeByOrderAction: (orderId, actionType) => {
    const next = get().actions.filter(
      (a) => !(a.orderId === orderId && a.actionType === actionType)
    );
    set({ actions: next });
    persist(next);
  },
  getByOrderAction: (orderId, actionType) =>
    get()
      .actions.filter((a) => !isRiderActionExpired(a))
      .find((a) => a.orderId === orderId && a.actionType === actionType) ?? null,
}));

export function riderPendingPhase(
  orderId: string | undefined,
  actionType: RiderActionType
): RiderActionPhase {
  if (!orderId) return "idle";
  const action = useRiderPendingActionStore.getState().getByOrderAction(orderId, actionType);
  if (!action || isRiderActionExpired(action)) return "idle";
  return action.phase;
}

export function findPendingRiderAction(
  actions: PendingRiderAction[],
  actionType: RiderActionType,
  ...orderRefs: Array<string | null | undefined>
): PendingRiderAction | null {
  const refs = new Set(orderRefs.map((r) => String(r ?? "").trim()).filter(Boolean));
  if (refs.size === 0) return null;
  const now = Date.now();
  return (
    actions.find(
      (a) =>
        a.actionType === actionType &&
        refs.has(a.orderId) &&
        !isRiderActionExpired(a, now)
    ) ?? null
  );
}
