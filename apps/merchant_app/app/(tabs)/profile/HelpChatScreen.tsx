import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  Alert,
  RefreshControl,
  Modal,
  Animated,
  Image,
  Linking,
  useWindowDimensions,
  AppState,
  type AppStateStatus,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type KeyboardEvent,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useHeaderHeight } from "@react-navigation/elements";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { getConfig, resolveUrlForDevice } from "@/config/env";
import { ticketDebugLog } from "@/lib/ticketDebugLog";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useTicketCopresence } from "@/hooks/useTicketCopresence";
import { useTicketMessagesRealtime } from "@/hooks/useTicketMessagesRealtime";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import {
  getTicketMessages,
  postTicketMessage,
  uploadTicketAttachment,
  createStoreTicket,
  fetchMerchantHelpSections,
  rateTicket,
  reopenTicket,
  type TicketMessage,
  type TicketMessageAttachmentInput,
  type TicketSummary,
} from "@/services/ticketApi";

/** Fallback when API has no rows yet (offline / migration not run). */
const STATIC_QUICK_OPTIONS_BY_SECTION: Record<string, string[]> = {
  outlet_status: [
    "I want to go online",
    "I want to go offline",
    "My store status is stuck",
    "Visibility or restriction issue",
    "Other",
  ],
  orders: [
    "I am not receiving orders",
    "Order got cancelled by mistake",
    "Delivery delay issue",
    "Wrong order received",
    "Other",
  ],
  order_timing: [
    "Order not picked by rider",
    "Order delayed",
    "Wrong order received",
    "Other",
  ],
  restaurant: [
    "Update timings or contacts",
    "FSSAI or documents",
    "Bank account or KYC",
    "Other",
  ],
  address: [
    "Update my outlet address",
    "Map location is wrong",
    "Coverage area issue",
    "Other",
  ],
  menu: [
    "I want to update my menu",
    "Item photos or prices",
    "Availability or charges",
    "Other",
  ],
  payments: [
    "Payout not received",
    "Wrong amount credited",
    "Settlement or invoice query",
    "Other",
  ],
  payout_delayed: [
    "Payout not received yet",
    "Settlement delayed",
    "Wrong payout amount",
    "Other",
  ],
  taxes: [
    "GST or TCS query",
    "TDS or tax reports",
    "Compliance issue",
    "Other",
  ],
  ads: [
    "Promotions or boosts",
    "Visibility or campaigns",
    "Other",
  ],
  branding: [
    "Standees or stickers",
    "Marketing materials",
    "Other",
  ],
  reports: [
    "Analytics or performance",
    "Ratings or insights",
    "Other",
  ],
  hygiene_audit: [
    "Upload hygiene audit report",
    "Request audit report",
    "Other",
  ],
  other: [
    "I need help with something else",
    "Other",
  ],
};

const DEFAULT_QUICK_OPTIONS = [
  "I need help with my issue",
  "Other",
];

const RATING_OPTIONS = [
  { value: 1, label: "Very poor", emoji: "😡" },
  { value: 2, label: "Poor", emoji: "🙁" },
  { value: 3, label: "Neutral", emoji: "😐" },
  { value: 4, label: "Good", emoji: "🙂" },
  { value: 5, label: "Excellent", emoji: "😍" },
] as const;

const SKELETON_BG = "#E2E8F0";
const IMAGE_URI_CACHE = new Map<string, string>();
/** While this screen is focused, poll often if Realtime is not connected (covers RLS/offline). */
const CHAT_FOCUS_POLL_MS = 4_000;
/** Focused + Realtime subscribed: light backup poll. */
const CHAT_FOCUS_POLL_WITH_REALTIME_MS = 12_000;
const MERCHANT_OPTIMISTIC_MATCH_WINDOW_MS = 3 * 60 * 1000;

function normalizeTicketMessageBody(text: unknown): string {
  return String(text ?? "")
    .trim()
    .replace(/\r\n/g, "\n");
}

function ticketMessageCreatedMs(raw: unknown): number {
  if (raw == null) return 0;
  if (raw instanceof Date) {
    return Number.isFinite(raw.getTime()) ? raw.getTime() : 0;
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  const text = String(raw).trim();
  if (!text) return 0;
  const numericEpoch = Number(text);
  if (Number.isFinite(numericEpoch) && text.length >= 10 && text.length <= 13) {
    const asMs = text.length === 13 ? numericEpoch : numericEpoch * 1000;
    const d = new Date(asMs);
    return Number.isFinite(d.getTime()) ? d.getTime() : 0;
  }
  let normalized = text.replace(" ", "T");
  if (/([+-]\d{2})$/.test(normalized)) normalized = `${normalized}:00`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }
  const d = new Date(normalized);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function serverRowCoversPendingOptimistic(
  server: TicketMessage,
  pending: TicketMessage,
  windowMs: number
): boolean {
  if (String(server.sender_type ?? "").toUpperCase() !== "MERCHANT") return false;
  if (
    normalizeTicketMessageBody(server.message_text) !== normalizeTicketMessageBody(pending.message_text)
  ) {
    return false;
  }
  return (
    Math.abs(ticketMessageCreatedMs(server.created_at) - ticketMessageCreatedMs(pending.created_at)) <= windowMs
  );
}

/**
 * Preserves optimistic rows while the server list is briefly stale; drops them once a matching
 * MERCHANT row exists (realtime or poll).
 */
function mergeServerTicketMessagesWithPending(serverList: TicketMessage[], prevList: TicketMessage[]): TicketMessage[] {
  const pending = prevList
    .filter(
      (m) =>
        m.delivery_status === "sending" &&
        typeof m.client_temp_id === "string" &&
        m.client_temp_id.length > 0
    )
    .sort((a, b) => ticketMessageCreatedMs(a.created_at) - ticketMessageCreatedMs(b.created_at));
  if (pending.length === 0) return serverList;

  const merchantServer = serverList.filter(
    (s) => String(s.sender_type ?? "").toUpperCase() === "MERCHANT"
  );
  const usedServerIds = new Set<number>();

  const kept = pending.filter((p) => {
    const match = merchantServer.find(
      (s) =>
        !usedServerIds.has(s.id) &&
        serverRowCoversPendingOptimistic(s, p, MERCHANT_OPTIMISTIC_MATCH_WINDOW_MS)
    );
    if (match) {
      usedServerIds.add(match.id);
      return false;
    }
    return true;
  });
  if (kept.length === 0) return serverList;

  return [...serverList, ...kept].sort(
    (a, b) => ticketMessageCreatedMs(a.created_at) - ticketMessageCreatedMs(b.created_at)
  );
}

/** Dashboard / API may send PUBLIC_NOTE, public_note, NOTE_PUBLIC, etc. */
function isPublicNoteMessageType(messageType: string | null | undefined): boolean {
  const raw = String(messageType ?? "").trim();
  if (!raw) return false;
  const norm = raw.toUpperCase().replace(/[\s-]+/g, "_");
  return norm === "PUBLIC_NOTE" || norm === "NOTE_PUBLIC";
}

/** Same rules as dashboard `TicketHeader.formatSnoozeCountdown` (full label + tone). */
function formatSnoozeCountdownLikeDashboard(snoozedUntil: string): {
  label: string;
  tone: "violet" | "amber" | "red";
} | null {
  const endMs = new Date(snoozedUntil).getTime();
  if (!Number.isFinite(endMs)) return null;
  const diff = endMs - Date.now();
  if (diff <= 0) return { label: "Resuming now", tone: "red" };
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const tone: "violet" | "amber" | "red" =
    totalSeconds < 60 ? "red" : totalSeconds < 300 ? "amber" : "violet";
  if (hours > 0) return { label: `Resumes in ${hours}h ${minutes}m ${seconds}s`, tone };
  if (minutes > 0) return { label: `Resumes in ${minutes}m ${seconds}s`, tone };
  return { label: `Resumes in ${seconds}s`, tone };
}

function ticketStatusNormalized(status: string | null | undefined): string {
  return String(status ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

/** Expo Router may pass `string | string[]` for a single key — normalize to one string. */
function firstRouteString(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) {
    const x = v[0];
    return typeof x === "string" ? x : undefined;
  }
  return v;
}

function isSnoozedTicketStatus(status: string | null | undefined): boolean {
  return ticketStatusNormalized(status) === "SNOOZED";
}

async function fetchImageLocalUri(uri: string, token?: string | null): Promise<string | null> {
  if (!uri) return null;
  const fromCache = IMAGE_URI_CACHE.get(uri);
  if (fromCache) return fromCache;
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) return null;
    const target = `${cacheDir}ticket-att-${Date.now()}-${Math.random().toString(36).slice(2)}.img`;
    const result = await FileSystem.downloadAsync(uri, target, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (result.status >= 200 && result.status < 300 && result.uri) {
      IMAGE_URI_CACHE.set(uri, result.uri);
      return result.uri;
    }
    return null;
  } catch {
    return null;
  }
}

function shouldCacheAttachmentToDisk(remote: string): boolean {
  const u = remote.toLowerCase();
  if (u.startsWith("file://") || u.startsWith("content://")) return false;
  if (u.startsWith("data:")) return false;
  return (
    /^https?:\/\//.test(u) ||
    u.includes("/attachments/proxy?") ||
    u.includes("tickets/images/")
  );
}

function ChatAttachmentImage({
  uri,
  token,
}: {
  uri: string;
  token?: string | null;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const resolvedRemote = resolveUrlForDevice(uri);
  const [renderUri, setRenderUri] = useState(resolvedRemote);
  const [hydrating, setHydrating] = useState(() => shouldCacheAttachmentToDisk(resolvedRemote));
  const [fallbackTried, setFallbackTried] = useState(false);

  useEffect(() => {
    const next = resolveUrlForDevice(uri);
    setRenderUri(next);
    setFallbackTried(false);
    setHydrating(shouldCacheAttachmentToDisk(next));
  }, [uri]);

  // Load via disk cache first: RN Image often stays blank inside ScrollView until interaction
  // (modal works because it is outside the list). file:// decodes reliably.
  useEffect(() => {
    const remote = resolveUrlForDevice(uri);
    if (!shouldCacheAttachmentToDisk(remote)) {
      setHydrating(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const localUri = await fetchImageLocalUri(remote, token);
      if (cancelled) return;
      if (localUri) setRenderUri(localUri);
      setHydrating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [uri, token]);

  const handleImageError = useCallback(() => {
    if (fallbackTried) return;
    setFallbackTried(true);
    void (async () => {
      const localUri = await fetchImageLocalUri(resolveUrlForDevice(uri), token);
      if (localUri) setRenderUri(localUri);
    })();
  }, [fallbackTried, uri, token]);

  const imgWidth = Math.max(160, Math.floor(windowWidth * 0.72));

  return (
    <View
      style={[styles.attachmentImageWrap, { width: imgWidth }]}
      collapsable={false}
      renderToHardwareTextureAndroid
    >
      <Image
        source={{ uri: renderUri }}
        style={[styles.attachmentImage, { width: imgWidth }]}
        resizeMode="cover"
        onError={handleImageError}
      />
      {hydrating ? (
        <View style={styles.attachmentImageLoading} pointerEvents="none">
          <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
        </View>
      ) : null}
    </View>
  );
}

function SkeletonBubble({
  align,
  animatedValue,
}: {
  align: "left" | "right";
  animatedValue: Animated.Value;
}) {
  const isLeft = align === "left";
  return (
    <View
      style={[
        styles.skeletonBubbleRow,
        isLeft ? styles.bubbleRowLeft : styles.bubbleRowRight,
      ]}
    >
      {isLeft && <View style={styles.skeletonAvatar} />}
      <View style={styles.skeletonBubbleColumn}>
        {isLeft && (
          <Animated.View
            style={[
              styles.skeletonAgentLabel,
              { opacity: animatedValue, backgroundColor: SKELETON_BG },
            ]}
          />
        )}
        <Animated.View
          style={[
            styles.skeletonBubble,
            { opacity: animatedValue, backgroundColor: SKELETON_BG },
          ]}
        />
        <Animated.View
          style={[
            styles.skeletonTime,
            { opacity: animatedValue, backgroundColor: SKELETON_BG },
          ]}
        />
      </View>
    </View>
  );
}

export default function HelpChatScreen() {
  const router = useRouter();
  const { token, supabaseUserId, partner } = useAuth();
  const { selectedStore } = useSelectedStore();
  const p = useLocalSearchParams<{
    ticketId?: string | string[];
    sectionId?: string | string[];
    sectionTitle?: string | string[];
    /** ticket_titles.id from Contact Us — disambiguates duplicate section codes. */
    ticketTitleId?: string | string[];
  }>();
  const ticketId = firstRouteString(p.ticketId);
  const sectionId = firstRouteString(p.sectionId);
  const sectionTitle = firstRouteString(p.sectionTitle);
  const ticketTitleIdParam = firstRouteString(p.ticketTitleId);

  const resolvedTicketTitleId = useMemo(() => {
    const raw = typeof ticketTitleIdParam === "string" ? ticketTitleIdParam.trim() : "";
    if (!/^\d+$/.test(raw)) return 0;
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : 0;
  }, [ticketTitleIdParam]);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();

  const [ticket, setTicket] = useState<TicketSummary | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [serverQuickBySection, setServerQuickBySection] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const composerRef = useRef<TextInput | null>(null);
  /** Ignore Android TextInput echoing the just-sent string back into onChangeText after clear/remount. */
  const suppressComposerEchoRef = useRef<{ until: number; text: string } | null>(null);
  const [showQuickOptions, setShowQuickOptions] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingValue, setRatingValue] = useState<number | null>(null);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [hasTappedChatAgain, setHasTappedChatAgain] = useState(false);
  const [showTicketCreatedToast, setShowTicketCreatedToast] = useState(false);
  const [showRequestReceivedCard, setShowRequestReceivedCard] = useState(true);
  const [previewAttachmentUri, setPreviewAttachmentUri] = useState<string | null>(null);
  /** False when user navigates away — stops slow polling; refetch on focus. */
  const [chatScreenFocused, setChatScreenFocused] = useState(false);
  /** Android: IME often overlays the composer with tab bar + `pan`; pad root by keyboard height. */
  const [androidKeyboardInset, setAndroidKeyboardInset] = useState(0);

  /** Ticket ID created in this session via Help & Support (create flow). Used to show "Request received" only then, not when opening from My Tickets. */
  const createdInThisSessionRef = useRef<number | null>(null);
  const prevSnoozeUiActiveRef = useRef<boolean | null>(null);
  /** Skip setState on silent polls when API payload matches last apply (avoids pointless re-renders). */
  const lastSyncFingerprintRef = useRef<string | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);
  /** When true, follow the thread (scroll on layout/content growth, e.g. images loading). */
  const stickChatToEndRef = useRef(true);
  /** Last message tail used to avoid redundant scrollToEnd on silent polls / identical merges. */
  const messagesScrollTailRef = useRef<string | null>(null);
  const messageScrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentSizeScrollDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatScrollGenerationRef = useRef(0);

  const skeletonPulse = useState(() => new Animated.Value(0.5))[0];
  const [snoozeTick, setSnoozeTick] = useState(0);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonPulse, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonPulse, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [skeletonPulse]);

  const storeId = selectedStore?.id ?? null;
  const initialNumericId = ticketId ? Number(ticketId) : NaN;
  const [activeTicketId, setActiveTicketId] = useState<number | null>(
    Number.isInteger(initialNumericId) && initialNumericId > 0 ? initialNumericId : null
  );

  const presenceDisplayName = useMemo(
    () => (typeof partner?.parent?.owner_name === "string" ? partner.parent.owner_name.trim() : ""),
    [partner?.parent?.owner_name]
  );

  const { copresenceLive } = useTicketCopresence({
    ticketNumericId: activeTicketId,
    presenceUserId: supabaseUserId,
    role: "merchant",
    displayName: presenceDisplayName,
    enabled: Boolean(token && activeTicketId && supabaseUserId),
  });

  /** True while snooze is active (future snoozed_until). When time passes, UI hides snooze banner before next fetch. */
  const snoozeUiActive = useMemo(() => {
    if (!ticket || !isSnoozedTicketStatus(ticket.status)) return false;
    const u = ticket.snoozed_until;
    if (!u) return true;
    const end = new Date(u).getTime();
    if (!Number.isFinite(end)) return true;
    void snoozeTick;
    return end > Date.now();
  }, [ticket?.status, ticket?.snoozed_until, snoozeTick]);

  /** After snooze end time, show Open (etc.) immediately; server wake + load() sync real status. */
  const statusKeyForUi = useMemo(() => {
    if (!ticket) return "";
    const s = ticketStatusNormalized(ticket.status);
    if (s === "SNOOZED" && !snoozeUiActive) return "OPEN";
    return s;
  }, [ticket?.status, snoozeUiActive]);

  const statusLabel = useMemo(() => {
    if (!ticket) return "New";
    const s = statusKeyForUi;
    switch (s) {
      case "OPEN":
        return "Open";
      case "IN_PROGRESS":
        return "In progress";
      case "WAITING_FOR_USER":
        return "Waiting for you";
      case "SNOOZED":
        return "Under review";
      case "RESOLVED":
        return "Resolved";
      case "CLOSED":
        return "Closed";
      default:
        return s || "Open";
    }
  }, [ticket, statusKeyForUi]);

  const statusStyle = useMemo(() => {
    if (!ticket) return styles.statusOpen;
    const s = statusKeyForUi;
    if (s === "RESOLVED" || s === "CLOSED") return styles.statusResolved;
    if (s === "WAITING_FOR_USER") return styles.statusWaiting;
    if (s === "SNOOZED") return styles.statusUnderReview;
    if (s === "IN_PROGRESS" || s === "REOPENED") {
      return styles.statusInProgress;
    }
    return styles.statusOpen;
  }, [ticket, statusKeyForUi]);

  const snoozeCountdownChip = useMemo(() => {
    if (!ticket || !snoozeUiActive) return null;
    const until = ticket.snoozed_until;
    if (!until) return null;
    void snoozeTick;
    return formatSnoozeCountdownLikeDashboard(until);
  }, [ticket, snoozeUiActive, ticket?.snoozed_until, snoozeTick]);

  const showRatingPrompt =
    !!ticket &&
    (ticketStatusNormalized(ticket.status) === "RESOLVED" ||
      ticketStatusNormalized(ticket.status) === "CLOSED") &&
    (ticket.satisfaction_rating == null || Number.isNaN(ticket.satisfaction_rating)) &&
    !hasTappedChatAgain;

  const showSnoozeBanner = !!ticket && snoozeUiActive && !showRatingPrompt;

  const ratingSummary = useMemo(() => {
    if (!ticket || ticket.satisfaction_rating == null || Number.isNaN(ticket.satisfaction_rating)) {
      return null;
    }
    const numeric = Number(ticket.satisfaction_rating);
    const opt = RATING_OPTIONS.find((o) => o.value === numeric);
    const label = opt?.label ?? `Rated ${numeric}/5`;
    const emoji = opt?.emoji ?? "⭐";

    let submittedAt = "";
    const satisfactionCollectedAt = (ticket as TicketSummary & { satisfaction_collected_at?: string | null }).satisfaction_collected_at;
    if (satisfactionCollectedAt) {
      try {
        const d = new Date(satisfactionCollectedAt);
        if (!Number.isNaN(d.getTime())) {
          submittedAt = d.toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch {
        submittedAt = "";
      }
    }

    return {
      numeric,
      label,
      emoji,
      feedback: ticket.satisfaction_feedback ?? "",
      submittedAt,
    };
  }, [ticket]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!token || !storeId || activeTicketId == null) {
      if (!opts?.silent) setLoading(false);
      return;
    }
    const silent = opts?.silent === true;
    if (!silent) setLoading(true);
    try {
      const data = await getTicketMessages(storeId, activeTicketId, token);
      const fallbackCreatedAt = data.ticket?.created_at ?? new Date().toISOString();
      const normalizedMessages = (data.messages ?? []).map((m) => ({
        ...m,
        created_at:
          typeof m.created_at === "string" && m.created_at.trim()
            ? m.created_at.trim()
            : fallbackCreatedAt,
      }));
      const description = (data.ticket?.description ?? "").trim();
      const normalizedDescription = description.replace(/\r\n/g, "\n");
      const hasSameMerchantMessage = normalizedMessages.some((m) => {
        if (String(m.sender_type ?? "").toUpperCase() !== "MERCHANT") return false;
        const body = String(m.message_text ?? "").trim().replace(/\r\n/g, "\n");
        return body === normalizedDescription;
      });
      const withSelectedIssue =
        normalizedDescription.length > 0 && !hasSameMerchantMessage
          ? ([
              {
                id: -(data.ticket?.id ?? activeTicketId),
                message_text: description,
                message_type: "TEXT",
                sender_type: "MERCHANT",
                sender_id: null,
                sender_name: null,
                attachments: [],
                created_at: data.ticket?.created_at ?? new Date().toISOString(),
              } as TicketMessage,
              ...normalizedMessages,
            ] as TicketMessage[])
          : normalizedMessages;

      const t = data.ticket;
      const fp = JSON.stringify({
        st: t?.status ?? "",
        pr: t?.priority ?? "",
        sn: t?.snoozed_until ?? "",
        sr: t?.satisfaction_rating ?? "",
        sfLen: String(t?.satisfaction_feedback ?? "").length,
        m: (withSelectedIssue as TicketMessage[]).map(
          (m) =>
            `${m.id}|${m.created_at}|${String(m.sender_type ?? "").toUpperCase()}|${String(m.message_text ?? "").length}|${(m.attachments ?? []).length}`
        ),
      });
      if (silent && lastSyncFingerprintRef.current === fp) {
        setError(null);
        return;
      }
      lastSyncFingerprintRef.current = fp;

      setTicket(data.ticket);
      setMessages((prev) => mergeServerTicketMessagesWithPending(withSelectedIssue, prev));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversation.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [storeId, token, activeTicketId]);

  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      setChatScreenFocused(true);
      if (activeTicketId != null && token && storeId) {
        void loadRef.current({ silent: true });
      }
      return () => setChatScreenFocused(false);
    }, [activeTicketId, token, storeId])
  );

  const { postgresLive } = useTicketMessagesRealtime({
    ticketNumericId: activeTicketId,
    enabled: Boolean(token && storeId && activeTicketId && getSupabaseAuth() != null),
    onMessagesStale: () => {
      void loadRef.current({ silent: true });
    },
  });

  useEffect(() => {
    if (!snoozeUiActive) return;
    const id = setInterval(() => setSnoozeTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [snoozeUiActive]);

  /** When countdown crosses from active → ended, fetch once so opportunistic server wake updates status. */
  useEffect(() => {
    if (!ticket || !isSnoozedTicketStatus(ticket.status)) {
      prevSnoozeUiActiveRef.current = null;
      return;
    }
    const prev = prevSnoozeUiActiveRef.current;
    if (prev === true && snoozeUiActive === false) {
      void load({ silent: true });
    }
    prevSnoozeUiActiveRef.current = snoozeUiActive;
  }, [ticket?.status, snoozeUiActive, load]);

  /** If API still reports SNOOZED after snooze end (e.g. race), poll until it clears. */
  useEffect(() => {
    if (!ticket || !isSnoozedTicketStatus(ticket.status) || snoozeUiActive) return;
    void load({ silent: true });
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      void load({ silent: true });
      if (n >= 24) clearInterval(id);
    }, 5000);
    return () => clearInterval(id);
  }, [ticket?.status, ticket?.snoozed_until, snoozeUiActive, load]);

  useEffect(() => {
    prevSnoozeUiActiveRef.current = null;
    lastSyncFingerprintRef.current = null;
    messagesScrollTailRef.current = null;
    chatScrollGenerationRef.current += 1;
    if (messageScrollDebounceRef.current) {
      clearTimeout(messageScrollDebounceRef.current);
      messageScrollDebounceRef.current = null;
    }
  }, [activeTicketId]);

  useEffect(() => {
    if (activeTicketId != null) {
      void load();
    } else {
      setLoading(false);
    }
  }, [load, activeTicketId, token, storeId]);

  useEffect(() => {
    if (messages.length > 0) {
      setShowQuickOptions(false);
    }
  }, [messages.length]);
  useEffect(() => {
    if (!showTicketCreatedToast) return;
    const timeout = setTimeout(() => setShowTicketCreatedToast(false), 4500);
    return () => clearTimeout(timeout);
  }, [showTicketCreatedToast]);
  useEffect(() => {
    if (!showRequestReceivedCard) return;
    const timeout = setTimeout(() => setShowRequestReceivedCard(false), 6000);
    return () => clearTimeout(timeout);
  }, [showRequestReceivedCard]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    if (activeTicketId == null || !token || !storeId || !chatScreenFocused) return;
    const pollMs = postgresLive ? CHAT_FOCUS_POLL_WITH_REALTIME_MS : CHAT_FOCUS_POLL_MS;
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      void load({ silent: true });
    };
    const start = () => {
      if (interval != null) return;
      interval = setInterval(tick, pollMs);
    };
    const stop = () => {
      if (interval != null) {
        clearInterval(interval);
        interval = undefined;
      }
    };
    const onAppState = (state: AppStateStatus) => {
      if (state === "active") start();
      else stop();
    };
    const sub = AppState.addEventListener("change", onAppState);
    if (AppState.currentState === "active") start();
    return () => {
      stop();
      sub.remove();
    };
  }, [activeTicketId, token, storeId, load, postgresLive, chatScreenFocused]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchMerchantHelpSections(token)
      .then((rows) => {
        if (cancelled || !rows.length) return;
        const map: Record<string, string[]> = {};
        for (const r of rows) {
          if (r.quickOptions.length > 0) {
            map[r.sectionId] = r.quickOptions;
            map[`__tid_${r.ticketTitleId}`] = r.quickOptions;
          }
        }
        setServerQuickBySection(map);
      })
      .catch(() => {
        /* keep static quick options */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const quickOptions = useMemo(() => {
    const sec = typeof sectionId === "string" ? sectionId.toLowerCase() : "";
    if (resolvedTicketTitleId > 0) {
      const byTitle = serverQuickBySection[`__tid_${resolvedTicketTitleId}`];
      if (byTitle && byTitle.length > 0) return byTitle;
    }
    return (
      serverQuickBySection[sec] ??
      STATIC_QUICK_OPTIONS_BY_SECTION[sec] ??
      DEFAULT_QUICK_OPTIONS
    );
  }, [sectionId, serverQuickBySection, resolvedTicketTitleId]);

  const firstMerchantMessage = useMemo(
    () => messages.find((m) => m.sender_type === "MERCHANT"),
    [messages]
  );
  const parseMessageDate = useCallback((raw: unknown): Date | null => {
    if (raw == null) return null;
    if (raw instanceof Date) {
      return Number.isFinite(raw.getTime()) ? raw : null;
    }
    if (typeof raw === "number" && Number.isFinite(raw)) {
      const d = new Date(raw);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    const text = String(raw).trim();
    if (!text) return null;
    const numericEpoch = Number(text);
    if (Number.isFinite(numericEpoch) && text.length >= 10 && text.length <= 13) {
      const asMs = text.length === 13 ? numericEpoch : numericEpoch * 1000;
      const d = new Date(asMs);
      return Number.isFinite(d.getTime()) ? d : null;
    }
    let normalized = text.replace(" ", "T");
    if (/([+-]\d{2})$/.test(normalized)) normalized = `${normalized}:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) {
      normalized = `${normalized}Z`;
    }
    const d = new Date(normalized);
    return Number.isFinite(d.getTime()) ? d : null;
  }, []);
  const formatMessageDateTime = useCallback((raw: unknown) => {
    const d = parseMessageDate(raw);
    if (!d) return null;
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  }, [parseMessageDate]);
  const getDateSeparatorLabel = useCallback((raw: unknown) => {
    const d = parseMessageDate(raw);
    if (!d) return "Today";
    const now = new Date();
    const toKey = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const currentKey = toKey(now);
    const msgKey = toKey(d);
    if (msgKey === currentKey) return "Today";
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    if (msgKey === toKey(y)) return "Yesterday";
    return d.toLocaleDateString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, [parseMessageDate]);
  const chatTimeline = useMemo(() => {
    const items: Array<{ type: "date"; key: string; label: string } | { type: "message"; key: string; message: TicketMessage }> = [];
    let lastDateKey = "";
    for (const m of messages) {
      const d = parseMessageDate(m.created_at);
      const dateKey = d
        ? d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
        : `unknown-${String(m.id)}`;
      if (dateKey !== lastDateKey) {
        items.push({ type: "date", key: `date-${dateKey}-${m.id}`, label: getDateSeparatorLabel(m.created_at) });
        lastDateKey = dateKey;
      }
      items.push({
        type: "message",
        key: `msg-${m.id}-${m.client_temp_id ?? ""}`,
        message: m,
      });
    }
    return items;
  }, [messages, getDateSeparatorLabel, parseMessageDate]);

  /** Single end scroll — avoids stacked timeouts/rAF that cause visible bubble “jumps”. */
  const scrollChatToEndOnce = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  const onChatScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const threshold = 160;
    const bottomMax = Math.max(0, contentSize.height - layoutMeasurement.height);
    stickChatToEndRef.current = bottomMax <= 8 || contentOffset.y >= bottomMax - threshold;
  }, []);

  const onChatContentSizeChange = useCallback(() => {
    if (!stickChatToEndRef.current) return;
    if (contentSizeScrollDebounceRef.current) clearTimeout(contentSizeScrollDebounceRef.current);
    contentSizeScrollDebounceRef.current = setTimeout(() => {
      contentSizeScrollDebounceRef.current = null;
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollToEnd({ animated: false });
      });
    }, 120);
  }, []);

  /** Only scroll when the last row actually changes (new/updated tail). No scroll on identical silent refresh. */
  useEffect(() => {
    if (loading || activeTicketId == null) return;
    if (messages.length === 0) {
      messagesScrollTailRef.current = null;
      return;
    }

    const last = messages[messages.length - 1];
    const tail = `${last.id}|${last.client_temp_id ?? ""}`;
    const prevTail = messagesScrollTailRef.current;
    if (prevTail === tail) return;

    stickChatToEndRef.current = true;

    if (messageScrollDebounceRef.current) clearTimeout(messageScrollDebounceRef.current);
    const animated = prevTail != null;
    const delay = animated ? 52 : 0;
    const gen = chatScrollGenerationRef.current;
    messageScrollDebounceRef.current = setTimeout(() => {
      messageScrollDebounceRef.current = null;
      if (gen !== chatScrollGenerationRef.current) return;
      scrollChatToEndOnce(animated);
      messagesScrollTailRef.current = tail;
    }, delay);
  }, [messages, loading, activeTicketId, scrollChatToEndOnce]);

  /** Keypad: one non-animated scroll after layout — no burst of scrollToEnd calls. */
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onKeyboardShow = (e?: KeyboardEvent) => {
      if (Platform.OS === "android" && e?.endCoordinates?.height != null) {
        setAndroidKeyboardInset(Math.max(0, e.endCoordinates.height));
      }
      stickChatToEndRef.current = true;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          chatScrollRef.current?.scrollToEnd({ animated: false });
        });
      });
    };
    const onKeyboardHide = () => {
      if (Platform.OS === "android") {
        setAndroidKeyboardInset(0);
      }
      requestAnimationFrame(() => {
        chatScrollRef.current?.scrollToEnd({ animated: false });
      });
    };
    const subShow = Keyboard.addListener(showEvent, onKeyboardShow);
    const subHide = Keyboard.addListener(hideEvent, onKeyboardHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (contentSizeScrollDebounceRef.current) {
        clearTimeout(contentSizeScrollDebounceRef.current);
        contentSizeScrollDebounceRef.current = null;
      }
    };
  }, []);

  const toAbsoluteAttachmentUrl = useCallback((value: string) => {
    const v = String(value || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return resolveUrlForDevice(v);
    const base = getConfig().apiBaseUrl;
    if (v.startsWith("/api/attachments/proxy")) {
      return resolveUrlForDevice(`${base}/v1/attachments/proxy${v.slice("/api/attachments/proxy".length)}`);
    }
    if (v.startsWith("/v1/attachments/proxy")) {
      return resolveUrlForDevice(`${base}${v}`);
    }
    if (v.startsWith("tickets/images/")) {
      return `${base}/v1/attachments/proxy?key=${encodeURIComponent(v)}`;
    }
    if (v.startsWith("/")) {
      if (v === "/") return "";
      return `${base}${v}`;
    }
    return resolveUrlForDevice(v);
  }, []);
  const extractStorageKey = useCallback((value: string): string | null => {
    const v = String(value || "").trim();
    if (!v) return null;
    if (v.startsWith("tickets/images/")) return v;
    try {
      const u = new URL(v, getConfig().apiBaseUrl);
      const key = u.searchParams.get("key");
      if (!key) return null;
      const decoded = decodeURIComponent(key).trim();
      return decoded || null;
    } catch {
      return null;
    }
  }, []);
  const resolveAttachmentUri = useCallback((raw: unknown): string => {
    if (typeof raw === "string") {
      const text = raw.trim();
      if (!text) return "";
      if (text.startsWith("{") || text.startsWith("\"{")) {
        try {
          const parsed = JSON.parse(text) as unknown;
          const rec =
            typeof parsed === "string"
              ? (JSON.parse(parsed) as { url?: unknown; storageKey?: unknown })
              : (parsed as { url?: unknown; storageKey?: unknown });
          if (rec && typeof rec === "object") {
            if (typeof rec.storageKey === "string" && rec.storageKey.trim()) {
              return toAbsoluteAttachmentUrl(rec.storageKey);
            }
            if (typeof rec.url === "string" && rec.url.trim()) {
              const keyFromUrl = extractStorageKey(rec.url);
              if (keyFromUrl) return toAbsoluteAttachmentUrl(keyFromUrl);
              return toAbsoluteAttachmentUrl(rec.url);
            }
          }
        } catch {
          // fallback below
        }
      }
      const keyMatch = /"storageKey"\s*:\s*"([^"]+)"/i.exec(text);
      if (keyMatch?.[1]) return toAbsoluteAttachmentUrl(keyMatch[1]);
      const urlMatch = /"url"\s*:\s*"([^"]+)"/i.exec(text);
      if (urlMatch?.[1]) {
        const keyFromUrl = extractStorageKey(urlMatch[1]);
        if (keyFromUrl) return toAbsoluteAttachmentUrl(keyFromUrl);
        return toAbsoluteAttachmentUrl(urlMatch[1]);
      }
      const keyFromText = extractStorageKey(text);
      if (keyFromText) return toAbsoluteAttachmentUrl(keyFromText);
      return toAbsoluteAttachmentUrl(text);
    }
    if (raw && typeof raw === "object") {
      const rec = raw as { url?: unknown; storageKey?: unknown };
      if (typeof rec.storageKey === "string" && rec.storageKey.trim()) return toAbsoluteAttachmentUrl(rec.storageKey);
      if (typeof rec.url === "string" && rec.url.trim()) {
        const keyFromUrl = extractStorageKey(rec.url);
        if (keyFromUrl) return toAbsoluteAttachmentUrl(keyFromUrl);
        return toAbsoluteAttachmentUrl(rec.url);
      }
    }
    return "";
  }, [toAbsoluteAttachmentUrl, extractStorageKey]);
  const looksLikeImageAttachment = useCallback((value: string) => {
    const v = value.toLowerCase();
    if (!v) return false;
    if (v.startsWith("data:image/")) return true;
    // Proxy URLs and R2 ticket image keys are image attachments even without extension.
    if (v.includes("/attachments/proxy?key=")) return true;
    if (v.includes("tickets/images/") || v.includes("tickets%2fimages%2f")) return true;
    if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)(\?|#|$)/.test(v)) return false;
    return (
      /\/attachments\/proxy(\?|$)/.test(v) ||
      // Be permissive for http(s) URLs that have no extension but are likely image resources.
      (/^https?:\/\//.test(v) && !/\.[a-z0-9]{2,5}(\?|#|$)/.test(v)) ||
      /\.(png|jpe?g|webp|gif|bmp|heic|heif)(\?|#|$)/.test(v)
    );
  }, []);
  const raisedConcernText = useMemo(() => {
    const msg = (firstMerchantMessage?.message_text ?? "").trim();
    if (msg.length > 0) return msg;
    const desc = (ticket?.description ?? "").trim();
    if (desc.length > 0) return desc;
    return "";
  }, [firstMerchantMessage?.message_text, ticket?.description]);

  const sendMessage = async (
    textToSend: string,
    attachments?: Array<string | { uri: string; fileName?: string; mimeType?: string }>
  ) => {
    const trimmed = textToSend.trim();
    if (!trimmed || !token || !storeId || sending) return;
    setSending(true);
    let clientTempId: string | null = null;
    try {
      let ticketIdToUse = activeTicketId;
      let createdNow = false;
      if (ticketIdToUse == null) {
        if (!sectionId && resolvedTicketTitleId < 1) {
          Alert.alert("Cannot start chat", "Support section missing. Please go back and try again.");
          return;
        }
        const sectionCode = (sectionId ?? "").trim().toLowerCase();
        const created = await createStoreTicket(storeId, sectionCode, token, {
          subject: typeof sectionTitle === "string" ? sectionTitle : undefined,
          description: trimmed,
          ticketTitleId: resolvedTicketTitleId > 0 ? resolvedTicketTitleId : undefined,
        });
        ticketIdToUse = created.id;
        createdNow = true;
        setActiveTicketId(created.id);
        setTicket(created);
        setShowTicketCreatedToast(true);
        setShowRequestReceivedCard(true);
        createdInThisSessionRef.current = created.id;
      }

      // If this is an existing ticket that was previously resolved/closed and
      // the merchant chose "Chat with us again", reopen it on first reply.
      if (
        ticket &&
        ticketIdToUse != null &&
        (ticketStatusNormalized(ticket.status) === "RESOLVED" ||
          ticketStatusNormalized(ticket.status) === "CLOSED") &&
        hasTappedChatAgain
      ) {
        try {
          const reopened = await reopenTicket(storeId, ticket.id, token);
          setTicket(reopened);
        } catch {
          // If reopen fails, still allow the message to be sent; status will remain as-is.
        }
      }

      const uploadedAttachmentUrls: string[] = [];
      const attachmentPayload: TicketMessageAttachmentInput[] = [];
      if (attachments && attachments.length > 0) {
        for (const rawAttachment of attachments) {
          const uri =
            typeof rawAttachment === "string"
              ? String(rawAttachment || "").trim()
              : String(rawAttachment?.uri || "").trim();
          if (!uri) continue;
          const fileName =
            typeof rawAttachment === "string"
              ? undefined
              : typeof rawAttachment.fileName === "string"
                ? rawAttachment.fileName
                : undefined;
          const mimeType =
            typeof rawAttachment === "string"
              ? undefined
              : typeof rawAttachment.mimeType === "string"
                ? rawAttachment.mimeType
                : undefined;
          // Local files from picker should be uploaded to ticket R2 path first.
          if (uri.startsWith("file://") || uri.startsWith("content://")) {
            const uploaded = await uploadTicketAttachment(storeId, ticketIdToUse!, uri, token, { fileName, mimeType });
            if (uploaded.url) uploadedAttachmentUrls.push(uploaded.url);
            attachmentPayload.push({
              storageKey: uploaded.storageKey || undefined,
              url: uploaded.url || undefined,
              name: uploaded.name || fileName || undefined,
              mimeType: uploaded.mimeType || mimeType || undefined,
            });
          } else {
            uploadedAttachmentUrls.push(uri);
            attachmentPayload.push({ url: uri, name: fileName, mimeType });
          }
        }
      }

      // New ticket flow: initial text is already persisted as unified_tickets.description.
      // Avoid posting the same text again to unified_ticket_messages (prevents duplicate thread entries in dashboard).
      const shouldPersistMessage = !createdNow || uploadedAttachmentUrls.length > 0;
      if (!shouldPersistMessage) {
        suppressComposerEchoRef.current = { until: Date.now() + 950, text: trimmed };
        setInput("");
        requestAnimationFrame(() => composerRef.current?.clear?.());
        return;
      }

      clientTempId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const temp: TicketMessage = {
        id: -Math.abs(Date.now()),
        message_text: trimmed,
        message_type: "TEXT",
        sender_type: "MERCHANT",
        sender_id: null,
        sender_name: null,
        attachments: uploadedAttachmentUrls,
        created_at: new Date().toISOString(),
        client_temp_id: clientTempId,
        delivery_status: "sending",
      };
      suppressComposerEchoRef.current = { until: Date.now() + 950, text: trimmed };
      setMessages((prev) => [...prev, temp]);
      setInput("");
      requestAnimationFrame(() => composerRef.current?.clear?.());

      const saved = await postTicketMessage(storeId, ticketIdToUse!, trimmed, token, attachmentPayload);
      setMessages((prev) =>
        prev.map((m) =>
          m.client_temp_id === clientTempId
            ? { ...saved, delivery_status: undefined, client_temp_id: undefined }
            : m
        )
      );
    } catch (e) {
      if (clientTempId != null) {
        setMessages((prev) => prev.filter((m) => m.client_temp_id !== clientTempId));
      }
      ticketDebugLog("sendMessage:catch", {
        err:
          e instanceof Error
            ? { name: e.name, message: e.message, stack: e.stack?.split("\n").slice(0, 4).join(" | ") }
            : String(e),
        storeId,
        activeTicketId,
        sectionId: sectionId ?? null,
        ticketTitleId: resolvedTicketTitleId,
      });
      const msg = (() => {
        if (!(e instanceof Error)) return "Failed to send message.";
        const m = e.message.trim();
        if (m.length > 0 && m !== "TypeError") return m;
        if (e.name === "TypeError" || m === "TypeError") {
          return "Network or server response issue. Check connection and API URL, then try again.";
        }
        return m || "Failed to send message.";
      })();
      Alert.alert("Message not sent", `${msg} You can edit the text below and try again.`);
      setInput(trimmed);
    } finally {
      setSending(false);
      setShowQuickOptions(false);
    }
  };

  const canSend = useMemo(() => {
    if (sending) return false;
    if (!token || !storeId) return false;
    if (activeTicketId == null && !sectionId && resolvedTicketTitleId < 1) return false;
    return input.trim().length > 0;
  }, [sending, token, storeId, activeTicketId, sectionId, resolvedTicketTitleId, input]);

  const onSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!token || !storeId) {
      Alert.alert("Cannot send", "Please select a store and login again.");
      return;
    }
    if (activeTicketId == null && !sectionId && resolvedTicketTitleId < 1) {
      Alert.alert("Cannot send", "Support section missing. Please go back and try again.");
      return;
    }
    await sendMessage(trimmed);
  };

  const onQuickOptionPress = (label: string) => {
    if (label.toLowerCase().startsWith("other")) {
      setShowQuickOptions(false);
      return;
    }
    // Preset option should always send directly (and create ticket if needed).
    setInput(label);
    void sendMessage(label);
  };

  const openAttachmentPicker = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if (perm?.status !== "granted" && perm?.status !== "undetermined") {
        Alert.alert(
          "Permission needed",
          "Allow access to your gallery to attach images and files."
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions?.Images ?? "images",
        allowsMultipleSelection: true,
        selectionLimit: 10,
        allowsEditing: false,
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.length) return;
      const picked = result.assets
        .map((a) => {
          const assetMeta = a as { fileName?: unknown; mimeType?: unknown };
          return {
            uri: typeof a?.uri === "string" ? a.uri.trim() : "",
            fileName: typeof assetMeta.fileName === "string" ? String(assetMeta.fileName) : undefined,
            mimeType: typeof assetMeta.mimeType === "string" ? String(assetMeta.mimeType) : undefined,
          };
        })
        .filter((x) => Boolean(x.uri));
      if (picked.length === 0) return;
      await sendMessage(picked.length > 1 ? "Shared attachments" : "Shared an attachment", picked);
    } catch {
      Alert.alert("Attachment failed", "Could not open gallery. Please try again.");
    }
  }, [sendMessage]);

  /** iOS: align with tab header (custom header may report 0 — keep a safe-area minimum). */
  const keyboardVerticalOffset =
    Platform.OS === "ios" ? Math.max(headerHeight, insets.top + 8) : 0;

  const handleSubmitRating = async () => {
    if (!storeId || !token || !ticket || ratingSubmitting || !ratingValue) return;
    try {
      setRatingSubmitting(true);
      const updated = await rateTicket(storeId, ticket.id, ratingValue, token, ratingFeedback);
      setTicket(updated);
    } catch (e) {
      Alert.alert(
        "Rating failed",
        e instanceof Error ? e.message : "Could not submit rating. Please try again."
      );
    } finally {
      setRatingSubmitting(false);
    }
  };

  const handleChatWithUs = () => {
    // Hide the rating section for this session and show chat input only.
    setHasTappedChatAgain(true);
  };

  /** Bottom safe inset on composer / rating bar (keyboard lift uses `androidKeyboardInset` on the outer avoider). */
  const composerBottomPad = 8 + insets.bottom;
  const ratingBarBottomPad = 12 + insets.bottom;

  return (
    <KeyboardAvoidingView
      style={[
        styles.container,
        Platform.OS === "android" && androidKeyboardInset > 0 ? { paddingBottom: androidKeyboardInset } : null,
      ]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
          >
            <Ionicons
              name="arrow-back"
              size={20}
              color={GatiMitraMerchant.textPrimary}
            />
          </Pressable>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Support chat
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {ticket?.ticket_id
                ? `Ticket ${ticket.ticket_id}`
                : sectionTitle ?? "New support request"}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.headerStatusRow}>
              <View style={[styles.statusPill, statusStyle]}>
                <Text style={styles.statusText}>{statusLabel}</Text>
              </View>
              {copresenceLive ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>Live</Text>
                </View>
              ) : null}
            </View>
            {snoozeCountdownChip ? (
              <View
                style={[
                  styles.snoozeHeaderChip,
                  snoozeCountdownChip.tone === "red"
                    ? styles.snoozeHeaderChipRed
                    : snoozeCountdownChip.tone === "amber"
                      ? styles.snoozeHeaderChipAmber
                      : styles.snoozeHeaderChipViolet,
                ]}
              >
                <Text
                  style={[
                    styles.snoozeHeaderChipText,
                    snoozeCountdownChip.tone === "red"
                      ? styles.snoozeHeaderChipTextRed
                      : snoozeCountdownChip.tone === "amber"
                        ? styles.snoozeHeaderChipTextAmber
                        : styles.snoozeHeaderChipTextViolet,
                  ]}
                  numberOfLines={1}
                >
                  {snoozeCountdownChip.label}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {loading && (
          <Animated.View
            style={[
              styles.ticketToast,
              { opacity: skeletonPulse },
            ]}
          >
            <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
            <Text style={styles.ticketToastText}>Opening support chat…</Text>
          </Animated.View>
        )}

        {error && !loading && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle-outline" size={18} color="#B91C1C" style={{ marginRight: 8 }} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}

        {showTicketCreatedToast && !loading && (
          <View style={styles.ticketToast}>
            <Ionicons
              name="checkmark-circle"
              size={18}
              color={GatiMitraMerchant.success}
              style={{ marginRight: 6 }}
            />
            <Text style={styles.ticketToastText}>
              Ticket created successfully. Our support team will review your request shortly.
            </Text>
          </View>
        )}

        {activeTicketId != null &&
          ticket &&
          !loading &&
          showRequestReceivedCard &&
          createdInThisSessionRef.current === activeTicketId && (
            <View style={styles.systemInfoCard}>
              <View style={styles.systemInfoHeader}>
                <Ionicons
                  name="information-circle-outline"
                  size={16}
                  color={GatiMitraMerchant.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.systemInfoTitle}>Request received</Text>
              </View>
              <Text style={styles.systemInfoBody}>
                Your request has been submitted successfully. The GatiMitra Support Team will review your concern and
                respond shortly.
              </Text>
              {!!raisedConcernText && (
                <View style={styles.systemSelectedIssueWrap}>
                  <Text style={styles.systemSelectedIssueLabel}>Selected issue</Text>
                  <View style={[styles.bubble, styles.bubbleMerchant, styles.systemSelectedIssueBubble]}>
                    <Text style={styles.bubbleTextMerchant}>{raisedConcernText}</Text>
                  </View>
                </View>
              )}
              <Text style={styles.systemInfoSecondary}>
                You may continue adding more details in this chat if needed.
              </Text>
            </View>
          )}

        <ScrollView
          ref={chatScrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          removeClippedSubviews={false}
          onScroll={onChatScroll}
          scrollEventThrottle={16}
          onContentSizeChange={onChatContentSizeChange}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[GatiMitraMerchant.primary]}
            />
          }
        >
        {chatTimeline.map((item) => {
          if (item.type === "date") {
            return (
              <View key={item.key} style={styles.dateSeparatorWrap}>
                <Text style={styles.dateSeparatorText}>{item.label}</Text>
              </View>
            );
          }
          const m = item.message;
          const isMerchant = m.sender_type === "MERCHANT";
          const hasAttachments = Array.isArray(m.attachments) && m.attachments.length > 0;
          const agentLabel = (() => {
            if (isMerchant) return "";
            const raw = (m.sender_name ?? "").trim();
            if (!raw) return "GM - GatiMitra team";
            const parts = raw.split(/\s+/);
            const first = parts[0];
            const last = parts.length > 1 ? parts[parts.length - 1] : "";
            const initials =
              (first ? first.charAt(0) : "") + (last ? last.charAt(0) : "");
            return `${initials.toUpperCase() || "GM"} - GatiMitra team`;
          })();
          const timeLabelFull = (() => {
            const formatted = formatMessageDateTime(m.created_at);
            if (!formatted) return isMerchant ? "Sent · Now" : "Received · Now";
            return isMerchant ? `Sent · ${formatted}` : `Received · ${formatted}`;
          })();
          const showPublicNoteTag = !isMerchant && isPublicNoteMessageType(m.message_type);
          return (
            <View
              key={item.key}
              style={[
                styles.bubbleRow,
                isMerchant ? styles.bubbleRowRight : styles.bubbleRowLeft,
              ]}
            >
              {!isMerchant && (
                <View style={styles.avatar}>
                  <Ionicons
                    name="headset-outline"
                    size={16}
                    color="#9ED8C0"
                  />
                </View>
              )}
              <View
                style={[
                  styles.bubbleColumn,
                  isMerchant ? styles.bubbleColumnRight : null,
                  hasAttachments ? styles.bubbleColumnAttachment : null,
                ]}
              >
                {!isMerchant && (
                  <View style={styles.agentLabelRow}>
                    <Text style={styles.agentLabel} numberOfLines={1}>
                      {agentLabel}
                    </Text>
                    {showPublicNoteTag ? (
                      <View style={styles.publicNoteTag}>
                        <Text style={styles.publicNoteTagText}>Note*</Text>
                      </View>
                    ) : null}
                  </View>
                )}
                {!hasAttachments ? (
                  <View
                    style={[
                      styles.bubble,
                      isMerchant ? styles.bubbleMerchant : styles.bubbleAgent,
                    ]}
                  >
                    <Text
                      style={
                        isMerchant ? styles.bubbleTextMerchant : styles.bubbleTextAgent
                      }
                    >
                      {m.message_text}
                    </Text>
                    {isMerchant ? (
                      <View style={styles.bubbleMetaRow}>
                        {m.delivery_status === "sending" ? (
                          <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.75)" />
                        ) : (
                          <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.9)" />
                        )}
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {hasAttachments && (
                  <View style={styles.attachmentStack}>
                    {m.attachments.map((raw, idx) => {
                      const uri = resolveAttachmentUri(raw);
                      const isImage = uri.length > 0 && looksLikeImageAttachment(uri);
                      return (
                        <Pressable
                          key={`${m.id}-att-${idx}`}
                          onPress={async () => {
                            if (!uri) return;
                            if (isImage) {
                              setPreviewAttachmentUri(uri);
                              return;
                            }
                            try {
                              const canOpen = await Linking.canOpenURL(uri);
                              if (!canOpen) throw new Error("cannot_open");
                              await Linking.openURL(uri);
                            } catch {
                              Alert.alert("Attachment", "Unable to open this attachment.");
                            }
                          }}
                          style={[
                            styles.attachmentCard,
                            isMerchant ? styles.attachmentCardMerchant : styles.attachmentCardAgent,
                          ]}
                        >
                          {isImage ? (
                            <ChatAttachmentImage uri={uri} token={token} />
                          ) : (
                            <View style={styles.attachmentFileFallback}>
                              <Ionicons
                                name="document-outline"
                                size={18}
                                color={isMerchant ? "#FFFFFF" : GatiMitraMerchant.primary}
                              />
                              <Text
                                style={isMerchant ? styles.attachmentTextMerchant : styles.attachmentTextAgent}
                                numberOfLines={1}
                              >
                                Attachment {idx + 1}
                              </Text>
                            </View>
                          )}
                          <View
                            style={[
                              styles.attachmentBottomBar,
                              isMerchant ? null : styles.attachmentBottomBarAgent,
                            ]}
                          >
                            <Text
                              style={[
                                styles.attachmentBottomText,
                                isMerchant ? null : styles.attachmentBottomTextAgent,
                              ]}
                              numberOfLines={1}
                            >
                              {(m.message_text ?? "").trim() || `Attachment ${idx + 1}`}
                            </Text>
                            {isMerchant ? (
                              <View style={styles.attachmentBottomMeta}>
                                {m.delivery_status === "sending" ? (
                                  <Ionicons name="time-outline" size={13} color="rgba(255,255,255,0.75)" />
                                ) : (
                                  <Ionicons name="checkmark-done" size={13} color="rgba(255,255,255,0.9)" />
                                )}
                              </View>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
                <Text
                  style={[
                    styles.timeText,
                    isMerchant ? styles.timeTextMerchant : styles.timeTextAgent,
                  ]}
                  numberOfLines={2}
                >
                  {timeLabelFull}
                </Text>
              </View>
              {isMerchant && !hasAttachments ? (
                <View style={[styles.avatar, styles.avatarMerchant]}>
                  <Ionicons
                    name="person-outline"
                    size={16}
                    color="#FFFFFF"
                  />
                </View>
              ) : null}
            </View>
          );
        })}
        </ScrollView>

        {!!ratingSummary && (
          <>
            <View style={styles.ratingSummaryCard}>
              <View style={styles.ratingExperienceHeaderRow}>
                <Text style={styles.ratingExperienceTitle}>Support experience</Text>
              </View>
              <View style={styles.ratingAutoSummaryRow}>
                <Text style={styles.ratingAutoEmoji}>{ratingSummary.emoji}</Text>
                <Text style={styles.ratingAutoLabel}>{ratingSummary.label}</Text>
                <View style={styles.ratingAutoStarsRow}>
                  {Array.from({ length: ratingSummary.numeric }).map((_, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <Ionicons
                      key={idx}
                      name="star"
                      size={14}
                      color="#FFC107"
                      style={styles.ratingAutoStarIcon}
                    />
                  ))}
                </View>
              </View>
              <Text style={styles.ratingExperienceNote}>Thank you for rating your support interaction.</Text>
              {!!ratingSummary.feedback && (
                <Text style={styles.ratingSummaryFeedback}>{`“${ratingSummary.feedback}”`}</Text>
              )}
              {!!ratingSummary.submittedAt && (
                <Text style={styles.ratingSummaryMeta}>
                  {`Submitted on: ${ratingSummary.submittedAt}`}
                </Text>
              )}
            </View>

            <View style={styles.ratingAutoCard}>
              <View style={styles.ratingAutoHeaderRow}>
                <Ionicons
                  name="information-circle"
                  size={16}
                  color={GatiMitraMerchant.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.ratingAutoTitle}>From GatiMitra Support Team</Text>
              </View>
              {ratingSummary.numeric >= 3 ? (
                <>
                  <Text style={styles.ratingAutoBody}>
                    Thank you for sharing your feedback with us.
                  </Text>
                  <Text style={styles.ratingAutoBody}>
                    We&apos;re glad that the <Text style={styles.ratingAutoBold}>GatiMitra Support Team</Text> was able
                    to assist you and resolve your concern. Your support and trust motivate us to continue improving our
                    services.
                  </Text>
                  <Text style={styles.ratingAutoSignature}>– GatiMitra Team</Text>
                </>
              ) : (
                <>
                  <Text style={styles.ratingAutoBody}>
                    We sincerely apologize that your experience with our support did not meet your expectations. Your
                    feedback is very important to us, and the <Text style={styles.ratingAutoBold}>GatiMitra Team</Text>{" "}
                    will review this case to further improve our support services.
                  </Text>
                  <Text style={styles.ratingAutoBody}>
                    If you still need assistance, please feel free to contact us again.
                  </Text>
                  <Text style={styles.ratingAutoSignature}>– GatiMitra Team</Text>
                </>
              )}
            </View>
          </>
        )}

        {showRatingPrompt && ticket && (
          <View style={[styles.ratingBar, { paddingBottom: ratingBarBottomPad }]}>
            <View style={styles.ratingClosedPill}>
              <Ionicons
                name="checkmark-circle"
                size={16}
                color={GatiMitraMerchant.statusCompleted}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.ratingClosedText}>
                {ticketStatusNormalized(ticket.status) === "CLOSED"
                  ? "This conversation has been closed"
                  : "This conversation has been resolved"}
              </Text>
            </View>

            <Text style={styles.ratingHeading}>Hey there!</Text>
            <Text style={styles.ratingSubheading}>
              {`We just ${String(ticket.status ?? "closed").toLowerCase()} ticket ${ticket.ticket_id}.`}
            </Text>
            <Text style={styles.ratingSubheading}>
              We know you&apos;re busy, so we just have one question:
            </Text>
            <Text style={[styles.ratingSubheading, { fontWeight: "600", marginBottom: 10 }]}>
              Are you satisfied with the support you received in this ticket?
            </Text>

            <View style={styles.ratingEmojisRow}>
              {RATING_OPTIONS.map((opt) => {
                const selected = ratingValue === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setRatingValue(opt.value)}
                    style={({ pressed }) => [
                      styles.ratingEmojiWrap,
                      selected && styles.ratingEmojiWrapSelected,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={styles.ratingEmoji}>{opt.emoji}</Text>
                    <Text
                      style={[
                        styles.ratingEmojiLabel,
                        selected && styles.ratingEmojiLabelSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.ratingFeedbackInput}
              placeholder="Share your feedback (optional)…"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={ratingFeedback}
              onChangeText={setRatingFeedback}
              multiline
            />
            <Pressable
              onPress={handleSubmitRating}
              disabled={!ratingValue || ratingSubmitting}
              style={({ pressed }) => [
                styles.ratingSubmitBtn,
                !ratingValue || ratingSubmitting ? styles.ratingSubmitBtnDisabled : null,
                pressed && !!ratingValue && !ratingSubmitting ? styles.ratingSubmitBtnPressed : null,
              ]}
            >
              <Text style={styles.ratingSubmitText}>
                {ratingSubmitting ? "Submitting…" : "Submit feedback"}
              </Text>
            </Pressable>

            {/* While rating is pending, allow reopening instead via Chat with us */}
              <Pressable
                onPress={handleChatWithUs}
                style={({ pressed }) => [
                  styles.chatWithUsBtn,
                  pressed && styles.chatWithUsBtnPressed,
                ]}
              >
                <Ionicons
                  name="chatbubbles-outline"
                  size={16}
                  color={GatiMitraMerchant.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.chatWithUsText}>Chat with us again</Text>
              </Pressable>
          </View>
        )}

        {/* Chat input visible when there is no pending rating form */}
        {!showRatingPrompt && (
          <View style={[styles.inputBar, { paddingBottom: composerBottomPad }]}>
            {showSnoozeBanner ? (
              <View style={styles.snoozeBanner}>
                <Text style={styles.snoozeBannerTitle}>Under review</Text>
                {snoozeCountdownChip ? (
                  <Text
                    style={[
                      styles.snoozeBannerCountdown,
                      snoozeCountdownChip.tone === "red"
                        ? styles.snoozeBannerCountdownRed
                        : snoozeCountdownChip.tone === "amber"
                          ? styles.snoozeBannerCountdownAmber
                          : styles.snoozeBannerCountdownViolet,
                    ]}
                  >
                    {snoozeCountdownChip.label}
                  </Text>
                ) : null}
                <Text style={styles.snoozeBannerHint}>
                  Your request is being carefully reviewed by our team. You’re welcome to add more
                  information below at any time.
                </Text>
                {ticket?.snooze_reason ? (
                  <Text style={styles.snoozeBannerReason} numberOfLines={2}>
                    {ticket.snooze_reason}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {showQuickOptions && activeTicketId == null && (
              <View style={styles.quickColumn}>
                {quickOptions.map((q) => (
                  <Pressable
                    key={q}
                    onPress={() => onQuickOptionPress(q)}
                    style={({ pressed }) => [
                      styles.quickChip,
                      pressed && styles.quickChipPressed,
                    ]}
                  >
                    <View style={styles.quickChipInner}>
                      <View style={styles.quickChipBullet} />
                      <Text style={styles.quickChipText}>{q}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={GatiMitraMerchant.textTertiary}
                        style={styles.quickChipIcon}
                      />
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.inputRow}>
              <Pressable
                onPress={openAttachmentPicker}
                style={({ pressed }) => [
                  styles.attachBtn,
                  pressed && styles.attachBtnPressed,
                ]}
              >
                <Ionicons
                  name="attach-outline"
                  size={18}
                  color={GatiMitraMerchant.primary}
                />
              </Pressable>
              <TextInput
                ref={composerRef}
                style={styles.input}
                value={input}
                onChangeText={(text) => {
                  const gate = suppressComposerEchoRef.current;
                  if (gate && Date.now() < gate.until && text === gate.text) {
                    return;
                  }
                  setInput(text);
                }}
                placeholder="Type your message…"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                multiline
              />
              <Pressable
                onPress={onSend}
                disabled={!canSend}
                style={({ pressed }) => [
                  styles.sendBtn,
                  !canSend && styles.sendBtnDisabled,
                  pressed && canSend && styles.sendBtnPressed,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="send" size={18} color="#fff" />
                )}
              </Pressable>
            </View>
          </View>
        )}
        <Modal
          visible={previewAttachmentUri != null}
          transparent
          animationType="fade"
          onRequestClose={() => setPreviewAttachmentUri(null)}
        >
          <View style={styles.previewBackdrop}>
            <Pressable style={styles.previewCloseBtn} onPress={() => setPreviewAttachmentUri(null)}>
              <Ionicons name="close" size={20} color="#fff" />
            </Pressable>
            {previewAttachmentUri ? (
              <Image source={{ uri: previewAttachmentUri }} style={styles.previewImage} resizeMode="contain" />
            ) : null}
          </View>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: H_PADDING,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  errorBanner: {
    marginHorizontal: H_PADDING,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: "#991B1B",
    lineHeight: 18,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  backButtonPressed: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  headerLeft: { flex: 1, marginRight: 8 },
  headerRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    maxWidth: "52%",
    flexShrink: 0,
  },
  headerStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: "100%",
  },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.35)",
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#065F46",
    letterSpacing: 0.2,
  },
  snoozeHeaderChip: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: "100%",
  },
  snoozeHeaderChipViolet: {
    backgroundColor: "#EDE9FE",
  },
  snoozeHeaderChipAmber: {
    backgroundColor: "#FEF3C7",
  },
  snoozeHeaderChipRed: {
    backgroundColor: "#FEE2E2",
  },
  snoozeHeaderChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  snoozeHeaderChipTextViolet: {
    color: "#6D28D9",
  },
  snoozeHeaderChipTextAmber: {
    color: "#B45309",
  },
  snoozeHeaderChipTextRed: {
    color: "#B91C1C",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
  statusOpen: {
    backgroundColor: GatiMitraMerchant.info,
  },
  statusWaiting: {
    backgroundColor: GatiMitraMerchant.warning,
  },
  statusInProgress: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  statusUnderReview: {
    backgroundColor: "#7C3AED",
  },
  statusResolved: {
    backgroundColor: GatiMitraMerchant.statusCompleted,
  },
  snoozeBanner: {
    marginBottom: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
  },
  snoozeBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5B21B6",
  },
  snoozeBannerCountdown: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  snoozeBannerCountdownViolet: {
    color: "#5B21B6",
  },
  snoozeBannerCountdownAmber: {
    color: "#B45309",
  },
  snoozeBannerCountdownRed: {
    color: "#B91C1C",
  },
  snoozeBannerHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 16,
    color: GatiMitraMerchant.textSecondary,
  },
  snoozeBannerReason: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 15,
    color: GatiMitraMerchant.textTertiary,
    fontStyle: "italic",
  },
  messages: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  messagesContent: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
    paddingBottom: 20,
  },
  bubbleRow: {
    flexDirection: "row",
    flexShrink: 1,
    marginBottom: 8,
  },
  bubbleRowLeft: {
    justifyContent: "flex-start",
  },
  bubbleRowRight: {
    justifyContent: "flex-end",
    paddingRight: 4,
  },
  dateSeparatorWrap: {
    alignSelf: "center",
    marginVertical: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#E5E7EB",
  },
  dateSeparatorText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  avatarMerchant: {
    marginRight: 0,
    marginLeft: 6,
    backgroundColor: GatiMitraMerchant.primary,
  },
  bubbleColumn: {
    width: "80%",
    maxWidth: "80%",
    flexShrink: 1,
  },
  bubbleColumnRight: {
    alignItems: "flex-end",
  },
  bubbleColumnAttachment: {
    width: "92%",
    maxWidth: "92%",
  },
  bubble: {
    maxWidth: "100%",
    minWidth: 96,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  bubbleMerchant: {
    backgroundColor: "#3EB489",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bubbleAgent: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  bubbleMetaRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  bubbleTextMerchant: {
    fontSize: 14,
    color: "#fff",
  },
  bubbleTextAgent: {
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
  },
  agentLabelRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 2,
    marginLeft: 4,
    gap: 6,
    maxWidth: "100%",
  },
  agentLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
    flexShrink: 1,
  },
  publicNoteTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: "rgba(22, 163, 74, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(22, 163, 74, 0.32)",
  },
  publicNoteTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
    letterSpacing: 0.15,
  },
  inputBar: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    marginRight: 8,
  },
  attachBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  attachBtnPressed: { opacity: 0.8 },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.primary,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnPressed: {
    opacity: 0.85,
  },
  quickColumn: {
    flexDirection: "column",
    gap: 8,
    marginBottom: 10,
  },
  quickChip: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  quickChipPressed: {
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  quickChipInner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickChipBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraMerchant.primary,
    marginRight: 8,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    flexShrink: 1,
  },
  quickChipIcon: {
    marginLeft: 8,
  },
  attachmentStack: {
    marginTop: 6,
    gap: 6,
  },
  attachmentCard: {
    borderRadius: 8,
    overflow: "hidden",
    width: "100%",
    maxWidth: "100%",
  },
  attachmentCardMerchant: {
    borderWidth: 0,
    backgroundColor: "#3EB489",
  },
  attachmentCardAgent: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  attachmentImageWrap: {
    height: 250,
    position: "relative",
    alignSelf: "center",
    maxWidth: "100%",
    backgroundColor: "#D1D5DB",
  },
  attachmentImage: {
    height: 250,
    backgroundColor: "#D1D5DB",
  },
  attachmentImageLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  attachmentTopMeta: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  attachmentTopMetaLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.95)",
    fontWeight: "600",
  },
  attachmentBottomBar: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  attachmentBottomBarAgent: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  attachmentBottomText: {
    fontSize: 12,
    color: "#FFFFFF",
    marginBottom: 4,
  },
  attachmentBottomTextAgent: {
    color: GatiMitraMerchant.textPrimary,
  },
  attachmentBottomMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 4,
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 20,
  },
  previewCloseBtn: {
    position: "absolute",
    top: 46,
    right: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  previewImage: {
    width: "100%",
    height: "84%",
  },
  attachmentFileFallback: {
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  attachmentTextMerchant: {
    fontSize: 11,
    color: "#e5f6e9",
    flex: 1,
  },
  attachmentTextAgent: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    flex: 1,
  },
  timeText: {
    marginTop: 4,
    fontSize: 10,
    color: GatiMitraMerchant.textSecondary,
  },
  timeTextMerchant: {
    alignSelf: "flex-end",
  },
  timeTextAgent: {
    alignSelf: "flex-start",
  },
  attachHintRow: {
    marginTop: 4,
  },
  attachHintText: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  skeletonBubbleRow: {
    flexDirection: "row",
    flexShrink: 1,
    marginBottom: 12,
  },
  skeletonAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    backgroundColor: SKELETON_BG,
  },
  skeletonBubbleColumn: {
    maxWidth: "90%",
    flexShrink: 1,
  },
  skeletonAgentLabel: {
    height: 10,
    borderRadius: 6,
    marginBottom: 4,
    marginLeft: 4,
    width: 90,
  },
  skeletonBubble: {
    height: 52,
    borderRadius: 18,
    marginBottom: 6,
  },
  skeletonTime: {
    height: 8,
    borderRadius: 4,
    width: 80,
    alignSelf: "flex-start",
  },
  skeletonStatusPill: {
    width: 64,
    height: 20,
    borderRadius: 999,
  },
  skeletonHeaderTitle: {
    height: 16,
    borderRadius: 6,
    marginBottom: 6,
    width: 140,
  },
  skeletonHeaderSubtitle: {
    height: 12,
    borderRadius: 6,
    width: 120,
  },
  skeletonInputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  skeletonAttach: {
    width: 34,
    height: 34,
    borderRadius: 17,
    marginRight: 8,
  },
  skeletonInput: {
    flex: 1,
    height: 40,
    borderRadius: CARD_RADIUS,
    marginRight: 8,
  },
  skeletonSend: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  ratingBar: {
    paddingHorizontal: H_PADDING,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  ratingClosedPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginBottom: 8,
  },
  ratingClosedText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  ratingSummaryCard: {
    marginHorizontal: H_PADDING,
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  ratingSummaryTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 4,
  },
  ratingSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingSummaryEmoji: {
    fontSize: 20,
    marginRight: 6,
  },
  ratingSummaryTextCol: {
    flex: 1,
  },
  ratingSummaryLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingSummarySubLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 2,
  },
  ratingSummaryFeedback: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 8,
  },
  ratingSummaryMeta: {
    marginTop: 6,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  ticketToast: {
    marginHorizontal: H_PADDING,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#DCFCE7",
    flexDirection: "row",
    alignItems: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  ticketToastText: {
    flex: 1,
    fontSize: 11,
    color: GatiMitraMerchant.textPrimary,
  },
  systemInfoCard: {
    marginHorizontal: H_PADDING,
    marginTop: 4,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  systemInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  systemInfoTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  systemInfoBody: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  systemInfoHighlight: {
    marginTop: 6,
    fontSize: 12,
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "500",
  },
  systemSelectedIssueWrap: {
    marginTop: 6,
  },
  systemSelectedIssueLabel: {
    marginBottom: 4,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  systemSelectedIssueBubble: {
    alignSelf: "flex-start",
    minWidth: 0,
    maxWidth: "92%",
  },
  systemInfoSecondary: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 6,
  },
  ratingExperienceHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    marginBottom: 6,
  },
  ratingExperienceTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingExperienceNote: {
    marginTop: 4,
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  ratingAutoCard: {
    marginTop: 2,
    marginBottom: 8,
    marginHorizontal: H_PADDING,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  ratingAutoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  ratingAutoSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  ratingAutoEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  ratingAutoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginRight: 6,
  },
  ratingAutoStarsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingAutoStarIcon: {
    marginRight: 2,
  },
  ratingAutoTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingAutoBody: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  ratingAutoBold: {
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  ratingAutoSignature: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    marginTop: 8,
    fontStyle: "italic",
  },
  ratingHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    marginBottom: 2,
  },
  ratingSubheading: {
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginBottom: 10,
  },
  ratingEmojisRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  ratingEmojiWrap: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 6,
    marginHorizontal: 2,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  ratingEmojiWrapSelected: {
    backgroundColor: "#ecfdf3",
    borderColor: GatiMitraMerchant.primary,
  },
  ratingEmoji: {
    fontSize: 20,
    marginBottom: 2,
  },
  ratingEmojiLabel: {
    fontSize: 11,
    color: GatiMitraMerchant.textSecondary,
  },
  ratingEmojiLabelSelected: {
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  ratingFeedbackInput: {
    minHeight: 60,
    maxHeight: 100,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  ratingSubmitBtn: {
    alignSelf: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
  },
  ratingSubmitBtnDisabled: {
    opacity: 0.5,
  },
  ratingSubmitBtnPressed: {
    opacity: 0.85,
  },
  ratingSubmitText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  chatWithUsBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  chatWithUsBtnPressed: {
    opacity: 0.9,
  },
  chatWithUsText: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
});

