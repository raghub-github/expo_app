/**
 * Single NEW_ORDER alert session shared by the background notification path
 * and the Incoming Order Modal. One order = one session; ownership can move
 * but playback never restarts from zero.
 */
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";
import type { OrderAcceptanceSettings } from "@/services/orderAcceptanceApi";
import type { DeviceOrderAlerts } from "@/lib/deviceOrderAlerts";
import {
  isOrderAlertSoundPlaying,
  playIncomingOrderAlert,
  resolveIncomingOrderChimeUrl,
  stopOrderAlertSound,
} from "@/lib/playOrderAlertSound";
import { volumeStepTo01 } from "@/lib/deviceOrderAlerts";
import { extractMerchantFoodOrderIdFromPush } from "@/lib/merchantNavigation";
import { isMerchantNewOrderPushData } from "@/lib/merchantNewOrderChannel";

const SESSION_KEY = "merchant_new_order_alert_session_v1";
const CONFIG_KEY = "merchant_new_order_alert_config_v1";
/** Bundled chime ~1.8s + rewind gap. Used only to estimate killed-state progress. */
export const DEFAULT_ALERT_CLIP_MS = 2500;

export type NewOrderAlertOwner = "background" | "modal" | "none";
export type NewOrderAlertState =
  | "queued"
  | "playing"
  | "completed"
  | "stopped";
export type NewOrderAlertStopReason =
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | "dismissed"
  | "replaced"
  | "disabled";
export type NewOrderAlertSource =
  | "FOREGROUND"
  | "BACKGROUND"
  | "MODAL"
  | "NOTIFICATION_TAP"
  | "COLD_START";

export type NewOrderAlertSession = {
  orderId: string;
  sessionId: string;
  eventId: string;
  soundUrl: string | null;
  configuredRepeats: number;
  completedRepeats: number;
  startedAt: number;
  endedAt?: number;
  clipMs: number;
  owner: NewOrderAlertOwner;
  state: NewOrderAlertState;
  stopReason?: NewOrderAlertStopReason;
  notificationTapped: boolean;
  orderOpened: boolean;
  volume01: number;
  ringInSilent: boolean;
  soundEnabled: boolean;
  androidNotificationId?: string | null;
};

type PersistedAlertConfig = {
  soundUrl: string | null;
  configuredRepeats: number;
  volume01: number;
  ringInSilent: boolean;
  soundEnabled: boolean;
  alertSoundEnabled: boolean;
};

type AlertSettings = Pick<
  OrderAcceptanceSettings,
  | "alert_sound_enabled"
  | "alert_sound_url"
  | "alert_sound_urls_by_slot"
  | "alert_sound_slot_choice"
  | "alert_sound_repeat_count"
>;

type ContinueArgs = {
  orderId: string;
  eventId?: string | null;
  source: NewOrderAlertSource;
  settings?: AlertSettings | null;
  device?: DeviceOrderAlerts | null;
  notificationDate?: number | null;
  androidNotificationId?: string | null;
};

let session: NewOrderAlertSession | null = null;
const parkedSessions = new Map<string, NewOrderAlertSession>();
let persistedConfig: PersistedAlertConfig | null = null;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let playGeneration = 0;
const knownEventIds = new Set<string>();

function logAlert(fields: Record<string, string | number | boolean | null | undefined>): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v ?? ""}`);
  console.log(`[NEW_ORDER_ALERT] ${parts.join(" ")}`);
}

function clampRepeats(n: unknown): number {
  const x = Math.floor(Number(n) || 1);
  return Math.max(1, Math.min(5, x));
}

export function normalizeNotificationDateMs(date: number | null | undefined): number | null {
  if (typeof date !== "number" || !Number.isFinite(date) || date <= 0) return null;
  return date < 1e12 ? Math.round(date * 1000) : Math.round(date);
}

export function estimateCompletedRepeats(args: {
  startedAt: number;
  now?: number;
  configuredRepeats: number;
  clipMs?: number;
  /** Killed-state OS channel plays once; count that as at least one pass. */
  assumeOsPlayedOnce?: boolean;
}): number {
  const configured = clampRepeats(args.configuredRepeats);
  const clip = Math.max(400, args.clipMs ?? DEFAULT_ALERT_CLIP_MS);
  const now = args.now ?? Date.now();
  const elapsed = Math.max(0, now - args.startedAt);
  let completed = Math.floor(elapsed / clip);
  if (args.assumeOsPlayedOnce) completed = Math.max(1, completed);
  return Math.max(0, Math.min(configured, completed));
}

export function remainingRepeatsOf(
  s: Pick<NewOrderAlertSession, "configuredRepeats" | "completedRepeats">
): number {
  return Math.max(0, clampRepeats(s.configuredRepeats) - Math.max(0, s.completedRepeats));
}

export function startedAtFromPush(
  data: Record<string, unknown> | null | undefined,
  notificationDate?: number | null
): number {
  const raw = data?.alertStartedAt ?? data?.alert_started_at;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  const fromMeta = normalizeNotificationDateMs(n);
  if (fromMeta) return fromMeta;
  const fromDate = normalizeNotificationDateMs(notificationDate);
  if (fromDate) return fromDate;
  return Date.now();
}

function jsShouldPlay(source: NewOrderAlertSource): boolean {
  return (
    source === "FOREGROUND" ||
    source === "MODAL" ||
    source === "NOTIFICATION_TAP" ||
    source === "COLD_START"
  );
}

function syncCompletedFromClock(s: NewOrderAlertSession, assumeOsPlayedOnce: boolean): void {
  const estimated = estimateCompletedRepeats({
    startedAt: s.startedAt,
    configuredRepeats: s.configuredRepeats,
    clipMs: s.clipMs,
    assumeOsPlayedOnce,
  });
  s.completedRepeats = Math.max(s.completedRepeats, estimated);
  if (s.completedRepeats >= s.configuredRepeats) {
    s.state = "completed";
    s.endedAt = s.startedAt + s.configuredRepeats * s.clipMs;
  }
}

/** Stop the OS tray chime so it cannot overlap JS/modal playback. */
export async function dismissNativeNewOrderAlerts(orderId?: string | null): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    const presented = await Notifications.getPresentedNotificationsAsync();
    const want = orderId ? String(orderId) : null;
    for (const n of presented) {
      const data = (n.request?.content?.data ?? {}) as Record<string, unknown>;
      if (!isMerchantNewOrderPushData(data)) continue;
      if (want) {
        const id = extractNewOrderIdFromPush(data);
        if (id && id !== want) continue;
      }
      await Notifications.dismissNotificationAsync(n.request.identifier);
    }
  } catch {
    /* Expo Go / missing native module */
  }
}

export function extractNewOrderIdFromPush(data: Record<string, unknown>): string | null {
  const food = extractMerchantFoodOrderIdFromPush(data);
  if (food) return food;
  const fallbacks = [data.orderId, data.order_id, data.notification_id, data.notificationId];
  for (const c of fallbacks) {
    const s = String(c ?? "").trim();
    if (s) return s;
  }
  return null;
}

export function extractNewOrderEventId(data: Record<string, unknown>, orderId: string): string {
  const nid = String(data.notification_id ?? data.notificationId ?? "").trim();
  if (nid) return nid;
  return `MERCHANT_NEW_ORDER:${orderId}`;
}

function configFrom(
  settings: AlertSettings,
  device: DeviceOrderAlerts
): PersistedAlertConfig {
  const soundEnabled = device.orderAlertsEnabled && device.soundAlertsEnabled;
  const chimeUrl =
    settings.alert_sound_enabled === false
      ? null
      : resolveIncomingOrderChimeUrl(settings, device);
  return {
    soundUrl: chimeUrl,
    configuredRepeats: clampRepeats(settings.alert_sound_repeat_count ?? 1),
    volume01: volumeStepTo01(device.volumeStep),
    ringInSilent: device.ringInSilent !== false,
    soundEnabled,
    alertSoundEnabled: settings.alert_sound_enabled !== false,
  };
}

async function persistSession(): Promise<void> {
  try {
    if (!session) {
      await SecureStore.deleteItemAsync(SESSION_KEY);
      return;
    }
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

async function persistConfig(): Promise<void> {
  if (!persistedConfig) return;
  try {
    await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(persistedConfig));
  } catch {
    /* ignore */
  }
}

function parseSession(raw: string | null): NewOrderAlertSession | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as NewOrderAlertSession;
    if (!j || typeof j.orderId !== "string" || !j.orderId) return null;
    return {
      ...j,
      configuredRepeats: clampRepeats(j.configuredRepeats),
      completedRepeats: Math.max(0, Math.floor(Number(j.completedRepeats) || 0)),
      startedAt: Number(j.startedAt) || Date.now(),
      clipMs: Math.max(400, Number(j.clipMs) || DEFAULT_ALERT_CLIP_MS),
    };
  } catch {
    return null;
  }
}

export async function hydrateNewOrderAlertManager(): Promise<void> {
  if (hydrated) return;
  if (hydratePromise) return hydratePromise;
  hydratePromise = (async () => {
    try {
      const [sessionRaw, configRaw] = await Promise.all([
        SecureStore.getItemAsync(SESSION_KEY),
        SecureStore.getItemAsync(CONFIG_KEY),
      ]);
      session = parseSession(sessionRaw);
      if (configRaw) {
        try {
          persistedConfig = JSON.parse(configRaw) as PersistedAlertConfig;
        } catch {
          persistedConfig = null;
        }
      }
      if (session && (session.state === "playing" || session.state === "queued")) {
        const completed = estimateCompletedRepeats({
          startedAt: session.startedAt,
          configuredRepeats: session.configuredRepeats,
          clipMs: session.clipMs,
          assumeOsPlayedOnce: !isOrderAlertSoundPlaying(),
        });
        session.completedRepeats = Math.max(session.completedRepeats, completed);
        if (session.completedRepeats >= session.configuredRepeats) {
          session.state = "completed";
        }
        logAlert({
          orderId: session.orderId,
          sessionId: session.sessionId,
          event: "HYDRATED",
          completedRepeats: session.completedRepeats,
          remainingRepeats: remainingRepeatsOf(session),
          state: session.state,
        });
        await persistSession();
      }
    } catch {
      /* ignore */
    } finally {
      hydrated = true;
    }
  })();
  return hydratePromise;
}

export function rememberIncomingOrderAlertConfig(
  settings: AlertSettings,
  device: DeviceOrderAlerts
): void {
  persistedConfig = configFrom(settings, device);
  void persistConfig();
}

export function getNewOrderAlertSession(): NewOrderAlertSession | null {
  return session;
}

export function getRemainingRepeats(orderId?: string | null): number {
  const id = orderId != null ? String(orderId) : session?.orderId;
  if (!id) return 0;
  const s = (session?.orderId === id ? session : null) ?? parkedSessions.get(id);
  if (!s || s.state === "stopped" || s.state === "completed") return 0;
  return remainingRepeatsOf(s);
}

function parkActiveSession(): void {
  if (!session) return;
  playGeneration += 1;
  if (isOrderAlertSoundPlaying()) stopOrderAlertSound();
  if (session.state === "playing") session.state = "queued";
  parkedSessions.set(session.orderId, { ...session });
  session = null;
}

function lookupSession(orderId: string): NewOrderAlertSession | null {
  if (session?.orderId === orderId) return session;
  return parkedSessions.get(orderId) ?? null;
}

function makeSession(
  orderId: string,
  eventId: string,
  owner: NewOrderAlertOwner,
  cfg: PersistedAlertConfig | null,
  args: ContinueArgs
): NewOrderAlertSession {
  const startedAt = normalizeNotificationDateMs(args.notificationDate) ?? Date.now();
  const configuredRepeats = cfg?.configuredRepeats ?? 1;
  const assumeOs =
    args.source === "NOTIFICATION_TAP" ||
    args.source === "COLD_START" ||
    args.source === "BACKGROUND";
  const completedRepeats =
    args.notificationDate != null
      ? estimateCompletedRepeats({
          startedAt,
          configuredRepeats,
          assumeOsPlayedOnce: assumeOs && !isOrderAlertSoundPlaying(),
        })
      : 0;
  return {
    orderId,
    sessionId: `${orderId}:${eventId}`,
    eventId,
    soundUrl: cfg?.soundUrl ?? null,
    configuredRepeats,
    completedRepeats,
    startedAt,
    clipMs: DEFAULT_ALERT_CLIP_MS,
    owner,
    state: "playing",
    notificationTapped: args.source === "NOTIFICATION_TAP" || args.source === "COLD_START",
    orderOpened: args.source === "MODAL",
    volume01: cfg?.volume01 ?? 1,
    ringInSilent: cfg?.ringInSilent !== false,
    soundEnabled: cfg?.soundEnabled !== false,
    androidNotificationId: args.androidNotificationId ?? null,
  };
}

function resolveConfig(
  settings?: AlertSettings | null,
  device?: DeviceOrderAlerts | null
): PersistedAlertConfig | null {
  if (settings && device) {
    const live = configFrom(settings, device);
    persistedConfig = live;
    void persistConfig();
    return live;
  }
  return persistedConfig;
}

async function markRepeatComplete(orderId: string, completedCount: number, gen: number): Promise<void> {
  if (gen !== playGeneration) return;
  if (!session || session.orderId !== orderId) return;
  if (session.state === "stopped") return;
  session.completedRepeats = Math.max(session.completedRepeats, completedCount);
  if (session.completedRepeats >= session.configuredRepeats) {
    session.state = "completed";
  }
  logAlert({
    orderId: session.orderId,
    sessionId: session.sessionId,
    completedRepeats: session.completedRepeats,
    remainingRepeats: remainingRepeatsOf(session),
    state: session.state,
  });
  await persistSession();
}

async function startPlayback(source: NewOrderAlertSource): Promise<void> {
  if (!session) return;
  if (!session.soundEnabled) {
    session.state = "stopped";
    session.stopReason = "disabled";
    await persistSession();
    return;
  }
  const remaining = remainingRepeatsOf(session);
  if (remaining <= 0) {
    session.state = "completed";
    await persistSession();
    logAlert({
      orderId: session.orderId,
      sessionId: session.sessionId,
      event: "SKIP_PLAY",
      reason: "NO_REMAINING",
      source,
    });
    return;
  }
  if (isOrderAlertSoundPlaying() && session.state === "playing") {
    logAlert({
      orderId: session.orderId,
      sessionId: session.sessionId,
      event: "KEEP_PLAYING",
      source,
      remainingRepeats: remaining,
      owner: session.owner,
    });
    return;
  }

  session.state = "playing";
  await persistSession();
  const gen = ++playGeneration;
  const orderId = session.orderId;
  const configured = session.configuredRepeats;
  const already = session.completedRepeats;
  const cfg = persistedConfig;

  logAlert({
    orderId,
    sessionId: session.sessionId,
    state: "STARTED",
    source,
    owner: session.owner,
    configuredRepeats: configured,
    completedRepeats: already,
    remainingRepeats: remaining,
  });

  const settings: AlertSettings = {
    alert_sound_enabled: cfg?.alertSoundEnabled !== false,
    alert_sound_url: cfg?.soundUrl ?? null,
    alert_sound_urls_by_slot: [cfg?.soundUrl ?? null, null, null],
    alert_sound_slot_choice: 0,
    alert_sound_repeat_count: configured,
  };
  const device: DeviceOrderAlerts = {
    orderAlertsEnabled: cfg?.soundEnabled !== false,
    soundAlertsEnabled: cfg?.soundEnabled !== false,
    alertSoundSlot: 0,
    volumeStep: Math.round((cfg?.volume01 ?? 1) * 10),
    ringInSilent: cfg?.ringInSilent !== false,
  };

  await playIncomingOrderAlert(settings, device, {
    alreadyCompleted: already,
    onRepeatComplete: (completedCount) => {
      void markRepeatComplete(orderId, completedCount, gen);
    },
  });

  if (gen !== playGeneration) return;
  if (session && session.orderId === orderId && session.state === "playing") {
    session.completedRepeats = session.configuredRepeats;
    session.state = "completed";
    await persistSession();
    logAlert({
      orderId,
      sessionId: session.sessionId,
      event: "PLAYBACK_FINISHED",
      completedRepeats: session.completedRepeats,
      remainingRepeats: 0,
    });
  }
}

/**
 * Start or continue the alert for a NEW_ORDER. Duplicate events for the same
 * orderId reuse the existing session and never overlap audio.
 */
export async function continueOrStartNewOrderAlert(args: ContinueArgs): Promise<NewOrderAlertSession | null> {
  await hydrateNewOrderAlertManager();
  const orderId = String(args.orderId || "").trim();
  if (!orderId) return null;

  const eventId = String(args.eventId ?? "").trim() || `MERCHANT_NEW_ORDER:${orderId}`;
  if (knownEventIds.has(eventId) && session?.orderId === orderId) {
    logAlert({
      orderId,
      sessionId: session.sessionId,
      event: "DEDUPED",
      eventId,
      source: args.source,
    });
    if (args.source === "FOREGROUND" || args.source === "BACKGROUND") {
      return session;
    }
  }
  knownEventIds.add(eventId);
  if (knownEventIds.size > 80) {
    const first = knownEventIds.values().next().value;
    if (first) knownEventIds.delete(first);
  }

  const cfg = resolveConfig(args.settings, args.device);
  const owner: NewOrderAlertOwner =
    args.source === "MODAL" ||
    args.source === "NOTIFICATION_TAP" ||
    AppState.currentState === "active"
      ? "modal"
      : "background";
  const modalWantsAudio = args.source === "MODAL" || args.source === "NOTIFICATION_TAP";

  if (session && session.orderId !== orderId) {
    if (!modalWantsAudio && (session.state === "playing" || isOrderAlertSoundPlaying())) {
      if (!parkedSessions.has(orderId)) {
        parkedSessions.set(orderId, {
          ...makeSession(orderId, eventId, "none", cfg, args),
          state: "queued",
          owner: "none",
        });
      }
      logAlert({
        orderId,
        event: "QUEUED",
        activeOrderId: session.orderId,
        source: args.source,
      });
      return session;
    }
    parkActiveSession();
  }

  const existing = lookupSession(orderId);
  if (existing) {
    parkedSessions.delete(orderId);
    session = existing;
    if (session.state === "stopped" || session.state === "completed") {
      logAlert({
        orderId,
        sessionId: session.sessionId,
        event: "IGNORE_RESTART",
        state: session.state,
        source: args.source,
        remainingRepeats: remainingRepeatsOf(session),
      });
      await persistSession();
      return session;
    }
    session.owner = owner;
    if (args.source === "MODAL" || args.source === "NOTIFICATION_TAP") {
      session.orderOpened = true;
    }
    await persistSession();
    if (!jsShouldPlay(args.source)) {
      logAlert({
        orderId,
        sessionId: session.sessionId,
        event: "NATIVE_OWNED",
        source: args.source,
        remainingRepeats: remainingRepeatsOf(session),
      });
      return session;
    }
    await startPlayback(args.source);
    return session;
  }

  session = makeSession(orderId, eventId, owner, cfg, args);
  await persistSession();
  if (!jsShouldPlay(args.source)) {
    logAlert({
      orderId,
      sessionId: session.sessionId,
      state: "STARTED",
      source: args.source,
      owner: "background",
      configuredRepeats: session.configuredRepeats,
      completedRepeats: session.completedRepeats,
      remainingRepeats: remainingRepeatsOf(session),
      event: "NATIVE_OWNED",
    });
    return session;
  }
  await startPlayback(args.source);
  return session;
}

/** Notification tap: keep the same session and hand ownership to the modal. */
export async function handleNewOrderNotificationTap(args: {
  data: Record<string, unknown>;
  notificationDate?: number | null;
  settings?: AlertSettings | null;
  device?: DeviceOrderAlerts | null;
  androidNotificationId?: string | null;
}): Promise<void> {
  await hydrateNewOrderAlertManager();
  if (!isMerchantNewOrderPushData(args.data)) return;
  const orderId = extractNewOrderIdFromPush(args.data);
  if (!orderId) return;
  const eventId = extractNewOrderEventId(args.data, orderId);
  const startedAt = startedAtFromPush(args.data, args.notificationDate);
  await dismissNativeNewOrderAlerts(orderId);

  if (session && session.orderId !== orderId) {
    parkActiveSession();
  }
  const existing = lookupSession(orderId);
  if (existing) {
    parkedSessions.delete(orderId);
    session = existing;
    session.startedAt = Math.min(session.startedAt, startedAt);
    syncCompletedFromClock(session, true);
    const remaining = remainingRepeatsOf(session);
    session.notificationTapped = true;
    session.owner = "modal";
    session.orderOpened = true;
    if (session.state === "playing" && isOrderAlertSoundPlaying()) {
      logAlert({
        orderId,
        sessionId: session.sessionId,
        event: "NOTIFICATION_TAPPED",
        remainingRepeats: remaining,
        action: "TRANSFER_TO_FOREGROUND",
      });
      await persistSession();
      return;
    }
    logAlert({
      orderId,
      sessionId: session.sessionId,
      event: "NOTIFICATION_TAPPED",
      remainingRepeats: remaining,
      action: "CONTINUE_REMAINING",
    });
    await persistSession();
    if (session.state !== "stopped" && session.state !== "completed") {
      await startPlayback("NOTIFICATION_TAP");
    }
    return;
  }

  await continueOrStartNewOrderAlert({
    orderId,
    eventId,
    source: "COLD_START",
    settings: args.settings,
    device: args.device,
    notificationDate: startedAt,
    androidNotificationId: args.androidNotificationId,
  });
  if (session && session.orderId === orderId) {
    session.notificationTapped = true;
    session.owner = "modal";
    logAlert({
      orderId,
      sessionId: session.sessionId,
      event: "NOTIFICATION_TAPPED",
      remainingRepeats: remainingRepeatsOf(session),
      action: "TRANSFER_TO_FOREGROUND",
    });
    await persistSession();
  }
}

/** Incoming Order Modal is showing this order — continue remaining only. */
export async function takeoverNewOrderAlertByModal(args: ContinueArgs): Promise<void> {
  await hydrateNewOrderAlertManager();
  const orderId = String(args.orderId || "").trim();
  if (!orderId) return;
  await dismissNativeNewOrderAlerts(orderId);

  if (session && session.orderId !== orderId) {
    parkActiveSession();
  }
  if (!session) {
    const parked = parkedSessions.get(orderId);
    if (parked) {
      parkedSessions.delete(orderId);
      session = parked;
    }
  }
  if (session && session.orderId === orderId) {
    syncCompletedFromClock(session, session.owner === "background");
    const remaining = remainingRepeatsOf(session);
    session.owner = "modal";
    session.orderOpened = true;
    logAlert({
      orderId,
      sessionId: session.sessionId,
      event: "MODAL_TAKEOVER",
      remainingRepeats: remaining,
      state: session.state,
    });
    await persistSession();
    if (session.state === "stopped" || session.state === "completed") return;
    if (isOrderAlertSoundPlaying() && session.state === "playing") return;
    await startPlayback("MODAL");
    return;
  }

  await continueOrStartNewOrderAlert({ ...args, source: "MODAL" });
}

export async function stopNewOrderAlert(
  orderId: string | null | undefined,
  reason: NewOrderAlertStopReason
): Promise<void> {
  await hydrateNewOrderAlertManager();
  const id = String(orderId ?? "").trim();
  const parked = id ? parkedSessions.get(id) : undefined;
  if (parked) {
    parked.state = "stopped";
    parked.stopReason = reason;
    parkedSessions.set(id, parked);
    logAlert({
      orderId: id,
      sessionId: parked.sessionId,
      event: "STOPPED",
      reason: reason === "accepted" ? "ORDER_ACCEPTED" : reason.toUpperCase(),
    });
  }
  if (session && id && session.orderId !== id) {
    return;
  }
  if (!session) {
    stopOrderAlertSound();
    return;
  }
  playGeneration += 1;
  stopOrderAlertSound();
  void dismissNativeNewOrderAlerts(session.orderId);
  session.state = "stopped";
  session.stopReason = reason;
  session.endedAt = Date.now();
  logAlert({
    orderId: session.orderId,
    sessionId: session.sessionId,
    event: "STOPPED",
    reason:
      reason === "accepted"
        ? "ORDER_ACCEPTED"
        : reason === "rejected"
          ? "ORDER_REJECTED"
          : reason === "expired"
            ? "ORDER_EXPIRED"
            : reason === "cancelled"
              ? "ORDER_CANCELLED"
              : reason.toUpperCase(),
  });
  await persistSession();
}

export function isNewOrderPushPayload(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  return isMerchantNewOrderPushData(data);
}
