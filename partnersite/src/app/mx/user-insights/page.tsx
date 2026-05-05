"use client";
import React, { useState, useEffect, Suspense, useRef, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { MXLayoutWhite } from "@/components/MXLayoutWhite";
import { PartnerShellHeaderSync } from "@/context/PartnerShellHeaderContext";
import { fetchRestaurantById as fetchStoreById } from "@/lib/database";
import { MerchantStore } from "@/lib/merchantStore";
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from "@/lib/constants";
import {
  Star,
  MessageSquare,
  AlertTriangle,
  Send,
  FileText,
  UserCheck,
  UserPlus,
  UserX,
  Filter,
  Calendar,
  CheckCircle,
  Inbox,
  X,
  Clock,
  AlertCircle,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  MoreVertical,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Video,
  Mic,
  Play,
  Pause,
} from "lucide-react";
import { SkeletonReviewRow } from "@/components/PageSkeleton";
import { getTicketAttachmentViewUrl } from "@/lib/ticket-attachment-url";
import { MobileHamburgerButton } from "@/components/MobileHamburgerButton";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface Review {
  id: number;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  customerMobile: string | null;
  orderId: number | null;
  orderPublicId?: string | null;
  orderSummary?: string | null;
  date: string;
  type: "Review" | "Complaint";
  message: string;
  response: string;
  respondedAt: string | null;
  userType: "repeated" | "new" | "fraud";
  rating: number;
  foodQualityRating: number | null;
  deliveryRating: number | null;
  packagingRating: number | null;
  reviewImages: string[];
  reviewTags: string[];
  orderCount: number;
  isVerified: boolean;
  isFlagged: boolean;
  flagReason: string | null;
}

interface Stats {
  total: number;
  reviews: number;
  complaints: number;
  repeatedUsers: number;
  newUsers: number;
  fraudUsers: number;
}

interface ImagePreview {
  file: File;
  preview: string;
  /** -2 = attached only (no overlay); 0–99 uploading; 100 done; -1 failed */
  uploadProgress: number;
  uploadedUrl?: string;
  kind?: "image" | "video" | "audio";
  name?: string;
}

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function twoLetterInitials(s: string | null | undefined) {
  const v = (s || "").trim();
  if (!v) return "YO";
  const base = v.includes("@") ? v.split("@")[0] : v;
  const parts = base
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const a = (parts[0] || base).charAt(0).toUpperCase();
  const b =
    (parts[1] ? parts[1].charAt(0) : (parts[0] || base).charAt(1)).toUpperCase() ||
    "O";
  return `${a}${b}`;
}

/** Decode R2 key from our proxy URL so we can infer type when path only appears inside `key=`. */
function pathForMediaKindInference(rawUrl: string): string {
  const s = (rawUrl || "").trim();
  if (!s) return "";
  try {
    if (s.includes("/api/attachments/proxy")) {
      const u = new URL(s, "http://local.invalid");
      const keyQ = u.searchParams.get("key");
      if (keyQ) {
        let dec = keyQ;
        for (let i = 0; i < 4; i++) {
          try {
            const next = decodeURIComponent(dec);
            if (next === dec) break;
            dec = next;
          } catch {
            break;
          }
        }
        return dec.toLowerCase();
      }
      const urlQ = u.searchParams.get("url");
      if (urlQ) {
        const inner = decodeURIComponent(urlQ);
        return new URL(inner).pathname.toLowerCase();
      }
    }
  } catch {
    /* fall through */
  }
  return s.split("?")[0].toLowerCase();
}

/** Infer audio/video from URL when attachment JSON omits or mislabels `kind`. */
function inferMediaAttachmentKind(
  rawUrl: string,
  declared?: string | null,
): "audio" | "video" | "file" {
  const d = (declared || "").toLowerCase().trim();
  if (d === "audio" || d === "video") return d;
  if (d === "image") return "file";
  const path = pathForMediaKindInference(rawUrl);
  if (
    /\.(mp3|m4a|aac|wav|ogg|opus|flac|amr|3gp)$/i.test(path) ||
    /\/audio\//i.test(path) ||
    /voice|recording|\.m4a$/i.test(path)
  ) {
    return "audio";
  }
  if (/\.(mp4|mov|m4v|avi|mkv|webm)$/i.test(path)) return "video";
  return "file";
}

/** Original ticket description is "outgoing" (right) when raised by the merchant in this portal. */
function ticketOriginalMessageOutbound(
  raisedByType: string | undefined,
): boolean {
  return (raisedByType || "MERCHANT").toUpperCase() === "MERCHANT";
}

function ThreadAvatarBubble({
  imageUrl,
  labelName,
  className,
  textClassName,
}: {
  imageUrl?: string | null;
  labelName: string;
  className?: string;
  textClassName?: string;
}) {
  const [imgBroken, setImgBroken] = useState(false);
  const initials = twoLetterInitials(labelName);
  const src =
    typeof imageUrl === "string" && imageUrl.trim() && !imgBroken
      ? imageUrl.trim()
      : null;
  return (
    <div
      className={`flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold sm:h-7 sm:w-7 ${className || ""}`}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setImgBroken(true)}
        />
      ) : (
        <span className={textClassName}>{initials}</span>
      )}
    </div>
  );
}

function formatVoiceDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Voice note pill (WhatsApp-style layout) with GatiMitra orange for outgoing.
 * Loads via fetch+blob so authenticated proxy URLs work reliably.
 */
function TicketVoiceNotePlayer({
  src,
  outgoing,
}: {
  src: string;
  outgoing: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [phase, setPhase] = useState<"loading" | "blob" | "direct">("loading");
  const [playSrc, setPlaySrc] = useState<string | null>(null);
  const blobRef = useRef<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const safe = (src || "").trim();

  const barHeights = useMemo(() => {
    const n = 26;
    let h = 0;
    for (let i = 0; i < safe.length; i++) {
      h = (h + safe.charCodeAt(i) * (i + 3)) % 1000;
    }
    return Array.from({ length: n }, (_, i) => 10 + ((h + i * 19) % 18));
  }, [safe]);

  useEffect(() => {
    if (!safe) return;
    let cancelled = false;
    setFailed(false);
    setPhase("loading");
    setPlaySrc(null);
    setPlaying(false);
    setDuration(0);
    setCurrent(0);
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
      blobRef.current = null;
    }

    (async () => {
      try {
        const res = await fetch(safe, { credentials: "include", cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        const u = URL.createObjectURL(blob);
        blobRef.current = u;
        setPlaySrc(u);
        setPhase("blob");
      } catch {
        if (!cancelled) {
          setPlaySrc(safe);
          setPhase("direct");
        }
      }
    })();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [safe]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el || !playSrc) return;
    const onTime = () => setCurrent(el.currentTime);
    const syncDur = () => {
      const d = el.duration;
      if (Number.isFinite(d) && d > 0) setDuration(d);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", syncDur);
    el.addEventListener("durationchange", syncDur);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", syncDur);
      el.removeEventListener("durationchange", syncDur);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
    };
  }, [playSrc]);

  const pct =
    duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;

  const pill =
    outgoing
      ? "bg-orange-600 text-white shadow-md ring-1 ring-orange-500/35 rounded-2xl rounded-br-md"
      : "bg-gray-200 text-gray-900 shadow-md ring-1 ring-gray-300/50 rounded-2xl rounded-bl-md";

  const onSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(duration) || duration <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const p = Math.min(1, Math.max(0, x / Math.max(1, r.width)));
    el.currentTime = p * duration;
  };

  const togglePlay = async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      return;
    }
    try {
      await el.play();
    } catch {
      toast.error("Could not play this voice note");
    }
  };

  if (!safe) return null;
  if (failed) {
    return (
      <div
        className={`inline-flex max-w-full min-w-[min(100%,240px)] flex-col gap-1 rounded-xl border border-dashed px-3 py-2 text-[11px] ${
          outgoing
            ? "border-white/40 bg-orange-700/30 text-white"
            : "border-gray-400 bg-white text-gray-800"
        }`}
      >
        <p className="font-medium">Audio unavailable</p>
        <a
          href={safe}
          target="_blank"
          rel="noreferrer"
          className={`font-semibold underline ${
            outgoing ? "text-white" : "text-orange-700"
          }`}
        >
          Open in new tab
        </a>
      </div>
    );
  }

  if (phase === "loading" && !playSrc) {
    return (
      <div
        className={`inline-flex max-w-full min-w-[min(100%,260px)] items-center gap-2 rounded-2xl px-3 py-2.5 ${pill}`}
      >
        <Loader2 className="h-5 w-5 shrink-0 animate-spin opacity-90" />
        <span className="text-xs font-medium opacity-90">Loading…</span>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex max-w-full min-w-[min(100%,260px)] flex-col gap-1.5 px-3 py-2.5 ${pill}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onClick={() => void togglePlay()}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
            outgoing
              ? "bg-white/20 text-white hover:bg-white/30"
              : "bg-white text-gray-900 shadow-sm hover:bg-orange-50"
          }`}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <Pause className="h-4 w-4" strokeWidth={2.25} />
          ) : (
            <Play className="ml-0.5 h-4 w-4" strokeWidth={2.25} />
          )}
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <div
            role="presentation"
            className="flex h-9 w-full cursor-pointer items-end justify-between gap-px px-0.5"
            onClick={onSeek}
          >
            {barHeights.map((px, i) => (
              <div
                key={i}
                className={`w-[3px] shrink-0 rounded-full ${
                  outgoing ? "bg-orange-100/85" : "bg-gray-600/35"
                }`}
                style={{ height: `${px}px` }}
              />
            ))}
          </div>
          <div
            className={`h-1 w-full overflow-hidden rounded-full ${
              outgoing ? "bg-black/20" : "bg-black/10"
            }`}
          >
            <div
              className={
                outgoing
                  ? "h-full rounded-full bg-white"
                  : "h-full rounded-full bg-orange-600"
              }
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      <div
        className={`flex items-center justify-between gap-2 text-[11px] font-medium tabular-nums leading-none ${
          outgoing ? "text-white/90" : "text-gray-600"
        }`}
      >
        <span>{formatVoiceDuration(current)}</span>
        <span className={outgoing ? "opacity-75" : "opacity-70"}>
          {formatVoiceDuration(duration)}
        </span>
      </div>
      <audio
        ref={audioRef}
        key={playSrc || ""}
        src={playSrc || undefined}
        preload="metadata"
        className="hidden"
        onError={() => {
          if (blobRef.current) {
            URL.revokeObjectURL(blobRef.current);
            blobRef.current = null;
            setPlaySrc(safe);
            setPhase("direct");
            return;
          }
          setFailed(true);
        }}
      />
    </div>
  );
}

/** e.g. 18 Apr to 25 Apr */
function formatRangeSummary(fromYmd: string, toYmd: string) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${a.toLocaleDateString("en-IN", o)} to ${b.toLocaleDateString("en-IN", o)}`;
}

// Normalize ticket status for consistent comparison (API may return PENDING, pending, etc.)
const normalizedTicketStatus = (s: string | undefined): string =>
  (s || "").toUpperCase().trim();

function DateRangePopover({
  calMonth,
  setCalMonth,
  rangeSel,
  setRangeSel,
  onClose,
  onApply,
}: {
  calMonth: Date;
  setCalMonth: (d: Date) => void;
  rangeSel: { a: string | null; b: string | null };
  setRangeSel: React.Dispatch<
    React.SetStateAction<{ a: string | null; b: string | null }>
  >;
  onClose: () => void;
  onApply: () => void;
}) {
  const y = calMonth.getFullYear();
  const m = calMonth.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInM = new Date(y, m + 1, 0).getDate();
  const prevMonthLast = new Date(y, m, 0).getDate();

  const inRange = (ymd: string) => {
    if (!rangeSel.a || !rangeSel.b) return false;
    const t = parseYmd(ymd).getTime();
    const t1 = parseYmd(rangeSel.a).getTime();
    const t2 = parseYmd(rangeSel.b).getTime();
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    return t >= lo && t <= hi;
  };

  const isEndpoint = (ymd: string) => rangeSel.a === ymd || rangeSel.b === ymd;

  const pickYmd = (ymd: string) => {
    setRangeSel((prev) => {
      if (!prev.a || (prev.a && prev.b)) return { a: ymd, b: null };
      return { ...prev, b: ymd };
    });
  };

  const labelA = rangeSel.a
    ? parseYmd(rangeSel.a).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Start";
  const labelB = rangeSel.b
    ? parseYmd(rangeSel.b).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "End";

  const cells: { ymd: string; label: string; muted: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) {
    const day = prevMonthLast - firstDow + i + 1;
    cells.push({
      ymd: toYmd(new Date(y, m - 1, day)),
      label: String(day),
      muted: true,
    });
  }
  for (let d = 1; d <= daysInM; d++) {
    cells.push({
      ymd: toYmd(new Date(y, m, d)),
      label: String(d),
      muted: false,
    });
  }
  let pad = 0;
  while (cells.length % 7 !== 0) {
    pad++;
    cells.push({
      ymd: toYmd(new Date(y, m + 1, pad)),
      label: String(pad),
      muted: true,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center pt-20 sm:pt-24 px-3 bg-black/40"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex border-b border-gray-200">
          <div className="flex-1 px-3 py-2.5 text-center text-xs font-medium text-gray-900 border-r border-gray-100">
            {labelA}
          </div>
          <div className="flex-1 px-3 py-2.5 text-center text-xs font-medium text-gray-900">
            {labelB}
          </div>
        </div>
        <div className="flex items-center justify-between px-2 py-2 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setCalMonth(new Date(y, m - 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="flex items-center gap-1 text-sm font-semibold text-gray-900">
            {calMonth.toLocaleDateString("en-IN", {
              month: "long",
              year: "numeric",
            })}
          </div>
          <button
            type="button"
            onClick={() => setCalMonth(new Date(y, m + 1, 1))}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="p-2">
          <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500 mb-1">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((c) => {
              const range = inRange(c.ymd);
              const end = isEndpoint(c.ymd);
              return (
                <button
                  key={`${c.ymd}-${c.label}-${c.muted}`}
                  type="button"
                  onClick={() => pickYmd(c.ymd)}
                  className={`aspect-square max-h-9 text-xs rounded-full transition-colors ${
                    c.muted ? "text-gray-300 hover:bg-gray-50" : ""
                  } ${
                    end
                      ? "bg-blue-600 text-white font-semibold"
                      : range
                        ? "bg-blue-100 text-blue-900"
                        : !c.muted
                          ? "text-gray-800 hover:bg-gray-100"
                          : ""
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-3 py-2.5 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!rangeSel.a || !rangeSel.b}
            className="px-4 py-1.5 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

const UserInsightsContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [responseImages, setResponseImages] = useState<
    Record<string, ImagePreview[]>
  >({});
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Default to User Insights view (reviews/complaints). Support Inbox only when user clicks "Inbox".
  const [showQueueView, setShowQueueView] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [ticketSearch, setTicketSearch] = useState("");
  const [datePreset, setDatePreset] = useState<
    "7d" | "15d" | "1m" | "3m" | "365d" | "custom"
  >("7d");
  const [dateFrom, setDateFrom] = useState(() => {
    const t = new Date();
    t.setDate(t.getDate() - 7);
    return toYmd(t);
  });
  const [dateTo, setDateTo] = useState(() => toYmd(new Date()));
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = parseYmd(toYmd(new Date()));
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rangeSel, setRangeSel] = useState<{
    a: string | null;
    b: string | null;
  }>({ a: null, b: null });

  const applyDatePreset = (preset: "7d" | "15d" | "1m" | "3m" | "365d") => {
    const now = new Date();
    const to = toYmd(now);
    const fromD = new Date(now);
    if (preset === "7d") fromD.setDate(fromD.getDate() - 7);
    if (preset === "15d") fromD.setDate(fromD.getDate() - 15);
    if (preset === "1m") fromD.setMonth(fromD.getMonth() - 1);
    if (preset === "3m") fromD.setMonth(fromD.getMonth() - 3);
    if (preset === "365d") fromD.setDate(fromD.getDate() - 365);

    setDatePreset(preset);
    setDateFrom(toYmd(fromD));
    setDateTo(to);
    setDatePopoverOpen(false);
  };

  const openCustomDatePicker = () => {
    setDatePreset("custom");
    setRangeSel({ a: dateFrom, b: dateTo });
    setCalMonth(() => {
      const d = parseYmd(dateFrom);
      return new Date(d.getFullYear(), d.getMonth(), 1);
    });
    setDatePopoverOpen(true);
  };
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string | null>(
    () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("userInsights_ticketStatusFilter");
        return saved || null;
      }
      return null;
    },
  );
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [showTicketDetail, setShowTicketDetail] = useState(false);
  const [ticketRating, setTicketRating] = useState<number | null>(null);
  const [ticketRatingFeedback, setTicketRatingFeedback] = useState("");
  const [ratingLoading, setRatingLoading] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ticketMessages, setTicketMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [ticketReply, setTicketReply] = useState("");
  const [replyLoading, setReplyLoading] = useState(false);
  const [ticketReplyImages, setTicketReplyImages] = useState<ImagePreview[]>(
    [],
  );
  const [reopenInProgress, setReopenInProgress] = useState(false);
  const ticketReplyFileInputRef = useRef<HTMLInputElement | null>(null);
  const ticketReplyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const [store, setStore] = useState<MerchantStore | null>(null);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats>({
    total: 0,
    reviews: 0,
    complaints: 0,
    repeatedUsers: 0,
    newUsers: 0,
    fraudUsers: 0,
  });
  const [sendingResponse, setSendingResponse] = useState<
    Record<string, boolean>
  >({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [expandedReview, setExpandedReview] = useState<number | null>(null);

  // If URL says inbox OR this is the dedicated inbox route, render inbox immediately.
  const isInboxRoute =
    searchParams?.get("view") === "inbox" || pathname === "/mx/support-inbox";
  const effectiveShowQueueView = isInboxRoute || showQueueView;

  // Legacy feedback route redirect lands here with `rate=1`.
  useEffect(() => {
    if (!effectiveShowQueueView) return;
    if (!selectedTicket?.id) return;
    if ((searchParams?.get("rate") || "").trim() !== "1") return;
    setShowRatingModal(true);
  }, [effectiveShowQueueView, searchParams, selectedTicket?.id]);

  // Strict dashboard behavior: disable page-level (html/body) scrolling while in Support Inbox.
  useEffect(() => {
    if (!effectiveShowQueueView) return;
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    html.classList.add("mx-no-page-scroll");
    body.classList.add("mx-no-page-scroll");
    return () => {
      html.classList.remove("mx-no-page-scroll");
      body.classList.remove("mx-no-page-scroll");
    };
  }, [effectiveShowQueueView]);

  // Backwards-compatible redirect: /mx/user-insights?view=inbox -> /mx/support-inbox
  useEffect(() => {
    if (pathname !== "/mx/user-insights") return;
    if (searchParams?.get("view") !== "inbox") return;
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("view");
    const qs = params.toString();
    router.replace(`/mx/support-inbox${qs ? `?${qs}` : ""}`);
  }, [pathname, router, searchParams]);

  // Get store ID
  useEffect(() => {
    const getStoreId = async () => {
      let id = searchParams?.get("storeId") ?? null;

      if (!id) {
        id =
          typeof window !== "undefined"
            ? localStorage.getItem("selectedStoreId")
            : null;
      }

      if (!id) {
        id = DEMO_STORE_ID;
      }

      setStoreId(id);
    };

    getStoreId();
  }, [searchParams]);

  // Load store data
  useEffect(() => {
    if (!storeId) return;

    const loadStore = async () => {
      try {
        const storeData = await fetchStoreById(storeId);
        if (storeData) {
          setStore(storeData as MerchantStore);
        }
      } catch (error) {
        console.error("Error loading store:", error);
      }
    };

    loadStore();
  }, [storeId]);

  // Fetch reviews
  useEffect(() => {
    if (!storeId) return;

    const fetchReviews = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/merchant/reviews?storeId=${storeId}`);
        const data = await res.json();
        if (data.success) {
          setReviews(data.reviews || []);
          setStats(
            data.stats || {
              total: 0,
              reviews: 0,
              complaints: 0,
              repeatedUsers: 0,
              newUsers: 0,
              fraudUsers: 0,
            },
          );
        }
      } catch (error) {
        console.error("Error fetching reviews:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReviews();
  }, [storeId]);

  const fetchTickets = async () => {
    setTicketsLoading(true);
    try {
      const res = await fetch("/api/merchant/tickets/list");
      const data = await res.json();
      if (data.success && Array.isArray(data.tickets)) {
        setTickets(data.tickets);
      }
    } catch (error) {
      console.error("Error fetching tickets:", error);
    } finally {
      setTicketsLoading(false);
    }
  };

  // Load tickets when queue view is shown
  useEffect(() => {
    if (effectiveShowQueueView) {
      fetchTickets();
    }
  }, [effectiveShowQueueView]);

  // Restore selected ticket from URL (priority) or localStorage after tickets load
  useEffect(() => {
    if (!effectiveShowQueueView || tickets.length === 0 || selectedTicket)
      return;
    const urlTicketId = searchParams?.get("ticket");
    const savedTicketId =
      typeof window !== "undefined"
        ? localStorage.getItem("userInsights_selectedTicketId")
        : null;
    const ticketIdToRestore = urlTicketId || savedTicketId;
    if (ticketIdToRestore) {
      const ticket = tickets.find(
        (t: any) => t.id.toString() === ticketIdToRestore,
      );
      if (ticket) {
        const normalized = {
          ...ticket,
          status: normalizedTicketStatus(ticket.status) || ticket.status,
        };
        setSelectedTicket(normalized);
        setShowTicketDetail(true);
        fetchTicketMessages(ticket.id);
        if (
          normalizedTicketStatus(ticket.status) === "RESOLVED" &&
          ticket.satisfaction_rating
        ) {
          setTicketRating(ticket.satisfaction_rating);
          setTicketRatingFeedback(ticket.satisfaction_feedback || "");
        }
      }
    }
  }, [tickets, effectiveShowQueueView, searchParams, selectedTicket]);

  // Auto-scroll to bottom when new messages arrive (WhatsApp-like: only if user is near bottom)
  useEffect(() => {
    if (!messagesEndRef.current || !chatContainerRef.current) return;
    const container = chatContainerRef.current;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 120;
    if (nearBottom) {
      const t = setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
      return () => clearTimeout(t);
    }
  }, [ticketMessages, selectedTicket]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (messagesEndRef.current && !messagesLoading) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 100);
    }
  }, [messagesLoading, selectedTicket]);

  // Real-time: new messages and ticket status updates (no manual refresh)
  useEffect(() => {
    if (!selectedTicket?.id) return;
    const supabase = createClient();
    const ticketId = selectedTicket.id;

    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "unified_ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          if (row.is_internal_note === true) return;
          const mtRaw = typeof row.message_type === "string" ? row.message_type : "";
          const mt = mtRaw.trim().toUpperCase().replace(/[\s-]+/g, "_");
          if (mt === "INTERNAL_NOTE") return;
          // Normalize: DB columns are snake_case (message_text); ensure compatibility
          const msg = {
            ...row,
            message_text: row.message_text ?? (row as any).messageText,
            created_at: row.created_at ?? (row as any).createdAt,
          } as any;
          setTicketMessages((prev) => {
            const has = prev.some((m) => m.id === msg.id);
            if (has) return prev;
            const next = [...prev, msg].sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            );
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "unified_tickets",
          filter: `id=eq.${ticketId}`,
        },
        (payload) => {
          const updated = payload.new as Record<string, unknown>;
          const normalized = {
            ...updated,
            status: normalizedTicketStatus((updated.status as string) || ""),
          };
          setSelectedTicket((prev: { id: number } | null) =>
            prev && prev.id === ticketId ? { ...prev, ...normalized } : prev,
          );
          setTickets((prev) =>
            prev.map((t) => (t.id === ticketId ? { ...t, ...normalized } : t)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTicket?.id]);

  // Polling fallback: refetch messages periodically so chat updates even without Realtime
  useEffect(() => {
    if (!selectedTicket?.id) return;
    const ticketId = selectedTicket.id;
    const interval = setInterval(() => {
      fetch(`/api/merchant/tickets/messages?ticket_id=${ticketId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.messages)) {
            setTicketMessages((prev) => {
              if (data.messages.length < prev.length) return prev;
              const prevIds = new Set(prev.map((m) => m.id));
              const newOnly = data.messages.filter(
                (m: any) => !prevIds.has(m.id),
              );
              if (newOnly.length === 0 && data.messages.length === prev.length)
                return prev;
              return data.messages;
            });
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedTicket?.id]);

  const handleQueueOpen = () => {
    setShowQueueView(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("userInsights_showQueueView", "true");
    }
    router.replace("/mx/support-inbox");
    fetchTickets();
  };

  const handleBackToInsights = () => {
    setShowQueueView(false);
    setShowTicketDetail(false);
    setSelectedTicket(null);
    if (typeof window !== "undefined") {
      localStorage.setItem("userInsights_showQueueView", "false");
      localStorage.removeItem("userInsights_selectedTicketId");
    }
    router.replace(pathname ?? "/mx/user-insights");
  };

  const fetchTicketMessages = async (ticketId: number) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(
        `/api/merchant/tickets/messages?ticket_id=${ticketId}`,
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.messages)) {
        setTicketMessages(data.messages);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleTicketClick = (ticket: any) => {
    const normalized = {
      ...ticket,
      status: normalizedTicketStatus(ticket.status) || ticket.status,
    };
    setSelectedTicket(normalized);
    setShowTicketDetail(true);
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "userInsights_selectedTicketId",
        ticket.id.toString(),
      );
    }
    fetchTicketMessages(ticket.id);
    // Load existing rating if ticket is resolved
    if (
      normalizedTicketStatus(ticket.status) === "RESOLVED" &&
      ticket.satisfaction_rating
    ) {
      setTicketRating(ticket.satisfaction_rating);
      setTicketRatingFeedback(ticket.satisfaction_feedback || "");
    } else {
      setTicketRating(null);
      setTicketRatingFeedback("");
    }
  };

  const handleBackToQueue = () => {
    setShowTicketDetail(false);
    setSelectedTicket(null);
    setTicketReply("");
    setTicketReplyImages([]);
    setTicketMessages([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem("userInsights_selectedTicketId");
    }
    router.replace("/mx/support-inbox");
  };

  const handleReopenTicket = async (ticketId: number) => {
    setReopenInProgress(true);
    try {
      const res = await fetch("/api/merchant/tickets/reopen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket_id: ticketId }),
      });

      const data = await res.json();
      if (data.success) {
        await fetchTickets();
        if (selectedTicket && selectedTicket.id === ticketId) {
          const updatedTicket = {
            ...selectedTicket,
            status: "REOPENED",
            resolution: null,
            resolved_by_name: null,
            reopened_at: new Date().toISOString(),
          };
          setSelectedTicket(updatedTicket);
          fetchTicketMessages(ticketId);
        }
      } else {
        alert(data.error || "Failed to reopen ticket");
      }
    } catch (error) {
      console.error("Error reopening ticket:", error);
      alert("Failed to reopen ticket");
    } finally {
      setReopenInProgress(false);
    }
  };

  const handleSubmitRating = async () => {
    if (!selectedTicket || !ticketRating) return;

    setRatingLoading(true);
    try {
      const res = await fetch("/api/merchant/tickets/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          rating: ticketRating,
          feedback: ticketRatingFeedback.trim() || null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        // Update selected ticket with rating
        setSelectedTicket({
          ...selectedTicket,
          satisfaction_rating: ticketRating,
          satisfaction_feedback: ticketRatingFeedback.trim() || null,
          satisfaction_collected_at: new Date().toISOString(),
        });
        // Refresh tickets list to update counts
        await fetchTickets();
        setShowRatingModal(false);
      } else {
        alert(data.error || "Failed to submit rating");
      }
    } catch (error) {
      console.error("Error submitting rating:", error);
      alert("Failed to submit rating");
    } finally {
      setRatingLoading(false);
    }
  };

  // Reset rating state when ticket changes
  useEffect(() => {
    if (selectedTicket) {
      if (selectedTicket.satisfaction_rating) {
        setTicketRating(selectedTicket.satisfaction_rating);
        setTicketRatingFeedback(selectedTicket.satisfaction_feedback || "");
      } else {
        setTicketRating(null);
        setTicketRatingFeedback("");
      }
    }
  }, [selectedTicket?.id]);

  const filteredTickets = useMemo(() => {
    const q = ticketSearch.trim().toLowerCase();
    const fromT = parseYmd(dateFrom).getTime();
    const toT = parseYmd(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;

    return tickets
      .map((t) => ({
        ...t,
        status: normalizedTicketStatus(t.status) || t.status,
      }))
      .filter((t) => {
        // date range
        const created = new Date(t.created_at).getTime();
        if (Number.isFinite(created) && (created < fromT || created > toT))
          return false;

        // status filter
        if (ticketStatusFilter) {
          const st = normalizedTicketStatus(t.status);
          if (ticketStatusFilter === "REOPENED") {
            if (
              !(
                st === "REOPENED" ||
                (st === "OPEN" && (t.resolved_at || t.reopened_at))
              )
            )
              return false;
          } else if (st !== ticketStatusFilter) {
            return false;
          }
        }

        // search
        if (!q) return true;
        const hay = [
          t.ticket_id,
          t.subject,
          t.description,
          t.ticket_title,
          t.ticket_category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [tickets, ticketStatusFilter, ticketSearch, dateFrom, dateTo]);

  const handleTicketImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages: ImagePreview[] = [];
    Array.from(files).forEach((file) => {
      const type = String(file.type || "").toLowerCase();
      const kind: ImagePreview["kind"] = type.startsWith("video/")
        ? "video"
        : type.startsWith("audio/")
          ? "audio"
          : "image";
      const preview = URL.createObjectURL(file);
      newImages.push({
        file,
        preview,
        uploadProgress: -2,
        kind,
        name: file.name,
      });
    });

    const ticketId = selectedTicket?.id;
    setTicketReplyImages((prev) => {
      const start = prev.length;
      const merged = [...prev, ...newImages];
      if (ticketId) {
        queueMicrotask(() => {
          newImages.forEach((entry, j) => {
            const idx = start + j;
            void (async () => {
              setTicketReplyImages((cur) =>
                cur.map((img, i) =>
                  i === idx && !img.uploadedUrl
                    ? { ...img, uploadProgress: 15 }
                    : img,
                ),
              );
              try {
                const keyOrUrl = await uploadImageForTicket(
                  entry.file,
                  ticketId,
                );
                if (!keyOrUrl) {
                  setTicketReplyImages((cur) =>
                    cur.map((img, i) =>
                      i === idx ? { ...img, uploadProgress: -1 } : img,
                    ),
                  );
                  toast.error(`Failed to upload "${entry.file.name}"`);
                  return;
                }
                const proxyUrl = getTicketAttachmentViewUrl(keyOrUrl);
                setTicketReplyImages((cur) =>
                  cur.map((img, i) =>
                    i === idx
                      ? {
                          ...img,
                          uploadedUrl: proxyUrl,
                          uploadProgress: 100,
                        }
                      : img,
                  ),
                );
              } catch {
                setTicketReplyImages((cur) =>
                  cur.map((img, i) =>
                    i === idx ? { ...img, uploadProgress: -1 } : img,
                  ),
                );
                toast.error(`Failed to upload "${entry.file.name}"`);
              }
            })();
          });
        });
      }
      return merged;
    });
  };

  const removeTicketImage = (index: number) => {
    setTicketReplyImages((prev) => {
      const removed = prev[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return prev.filter((_: ImagePreview, i: number) => i !== index);
    });
  };

  const handleSendReply = async () => {
    if (
      (!ticketReply.trim() && ticketReplyImages.length === 0) ||
      !selectedTicket
    )
      return;
    if (normalizedTicketStatus(selectedTicket.status) === "CLOSED") return; // UI guard: never send when closed

    setReplyLoading(true);
    try {
      const uploadedImageUrls: string[] = [];
      const uploadedAttachments: Array<{
        url: string;
        kind: string;
        name?: string;
      }> = [];

      const pendingIndices = ticketReplyImages
        .map((img, i) => (!img.uploadedUrl ? i : -1))
        .filter((i) => i >= 0);
      if (pendingIndices.length > 0) {
        setTicketReplyImages((prev) =>
          prev.map((img, i) =>
            pendingIndices.includes(i) && !img.uploadedUrl
              ? { ...img, uploadProgress: 40 }
              : img,
          ),
        );
      }

      const uploadResults = await Promise.all(
        ticketReplyImages.map(async (image, i) => {
          if (image.uploadedUrl) {
            return { i, image, proxyUrl: image.uploadedUrl, ok: true };
          }
          if (image.uploadProgress === -1) {
            return { i, image, proxyUrl: "", ok: false };
          }
          const keyOrUrl = await uploadImageForTicket(
            image.file,
            selectedTicket.id,
          );
          const ok = !!keyOrUrl;
          const proxyUrl = keyOrUrl
            ? getTicketAttachmentViewUrl(keyOrUrl)
            : "";
          return { i, image, proxyUrl, ok };
        }),
      );

      setTicketReplyImages((prev) =>
        prev.map((img, idx) => {
          const r = uploadResults[idx];
          if (!r || img.uploadedUrl) return img;
          if (r.ok && r.proxyUrl) {
            return {
              ...img,
              uploadedUrl: r.proxyUrl,
              uploadProgress: 100,
            };
          }
          return { ...img, uploadProgress: -1 };
        }),
      );

      for (const r of uploadResults) {
        if (!r.ok || !r.proxyUrl) {
          toast.error(
            `Failed to upload "${r.image.file.name}". Remove and try again.`,
          );
          continue;
        }
        const kind =
          r.image.kind ??
          (r.image.file.type?.startsWith("video/")
            ? "video"
            : r.image.file.type?.startsWith("audio/")
              ? "audio"
              : "image");
        if (kind === "image") uploadedImageUrls.push(r.proxyUrl);
        uploadedAttachments.push({
          url: r.proxyUrl,
          kind,
          name: r.image.name || r.image.file.name,
        });
      }

      if (!ticketReply.trim() && uploadedAttachments.length === 0) {
        setReplyLoading(false);
        return;
      }

      const res = await fetch("/api/merchant/tickets/reply", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: selectedTicket.id,
          message: ticketReply.trim(),
          images: uploadedImageUrls,
          attachments: uploadedAttachments,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTicketReply("");
        setTicketReplyImages((prev) => {
          prev.forEach((img) => {
            if (img.preview) URL.revokeObjectURL(img.preview);
          });
          return [];
        });
        fetchTicketMessages(selectedTicket.id);
        // Reset reply textarea height to original after send
        setTimeout(() => {
          const ta = ticketReplyTextareaRef.current;
          if (ta) {
            ta.style.height = "auto";
            ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
          }
        }, 0);
      }
    } catch (error) {
      console.error("Error sending reply:", error);
    } finally {
      setReplyLoading(false);
    }
  };

  const handleImageSelect = (reviewId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages: ImagePreview[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith("image/")) {
        const preview = URL.createObjectURL(file);
        newImages.push({
          file,
          preview,
          uploadProgress: 0,
        });
      }
    });

    setResponseImages((prev) => ({
      ...prev,
      [reviewId]: [...(prev[reviewId] || []), ...newImages],
    }));
  };

  const removeImage = (reviewId: string, index: number) => {
    setResponseImages((prev) => {
      const images = prev[reviewId] || [];
      const removed = images[index];
      if (removed?.preview) {
        URL.revokeObjectURL(removed.preview);
      }
      return {
        ...prev,
        [reviewId]: images.filter((_: ImagePreview, i: number) => i !== index),
      };
    });
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("parent", "review-responses");
      formData.append("filename", `${Date.now()}_${file.name}`);

      const res = await fetch("/api/upload/r2", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        return data.url;
      }
      return null;
    } catch (error) {
      console.error("Error uploading image:", error);
      return null;
    }
  };

  /** Upload for ticket reply: same R2 prefix as merchant app / dashboard (`tickets/images/{ticketId}/…`). */
  const uploadImageForTicket = async (
    file: File,
    ticketId: number,
  ): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("parent", `tickets/images/${ticketId}`);
      const safe =
        file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "file";
      formData.append("filename", `${crypto.randomUUID()}-${safe}`);

      const res = await fetch("/api/upload/r2", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();
      if (data.success && data.url) {
        return data.url; // For tickets/ parent this is the R2 key, not signed URL
      }
      return null;
    } catch (error) {
      console.error("Error uploading ticket image:", error);
      return null;
    }
  };

  const handleSendResponse = async (reviewId: string) => {
    const message = responseText[reviewId]?.trim();
    const images = responseImages[reviewId] || [];

    if (!message && images.length === 0) return;

    setSendingResponse((prev) => ({ ...prev, [reviewId]: true }));

    try {
      // Upload images first
      const uploadedImageUrls: string[] = [];
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        if (!image.uploadedUrl) {
          // Update progress
          setResponseImages((prev) => ({
            ...prev,
            [reviewId]: (prev[reviewId] || []).map((img, idx) =>
              idx === i ? { ...img, uploadProgress: 50 } : img,
            ),
          }));

          const url = await uploadImage(image.file);
          if (url) {
            uploadedImageUrls.push(url);
            // Mark as uploaded
            setResponseImages((prev) => ({
              ...prev,
              [reviewId]: (prev[reviewId] || []).map((img, idx) =>
                idx === i
                  ? { ...img, uploadedUrl: url, uploadProgress: 100 }
                  : img,
              ),
            }));
          }
        } else {
          uploadedImageUrls.push(image.uploadedUrl);
        }
      }

      // Send response
      const res = await fetch("/api/merchant/reviews/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: parseInt(reviewId),
          message: message || "",
          images: uploadedImageUrls,
        }),
      });

      const data = await res.json();
      if (data.success) {
        let newResponse = (message || "").trim();
        if (uploadedImageUrls.length > 0) {
          const imageJson = JSON.stringify(uploadedImageUrls);
          newResponse = newResponse
            ? `${newResponse}\n\n[IMAGES:${imageJson}]`
            : `[IMAGES:${imageJson}]`;
        }
        setReviews((prev) =>
          prev.map((r) =>
            String(r.id) === reviewId
              ? {
                  ...r,
                  response: newResponse,
                  respondedAt: new Date().toISOString(),
                }
              : r,
          ),
        );

        // Clear form
        setResponseText((prev) => ({ ...prev, [reviewId]: "" }));
        setResponseImages((prev) => {
          const images = prev[reviewId] || [];
          images.forEach((img) => {
            if (img.preview) URL.revokeObjectURL(img.preview);
          });
          return { ...prev, [reviewId]: [] };
        });
      }
    } catch (error) {
      console.error("Error sending response:", error);
    } finally {
      setSendingResponse((prev) => ({ ...prev, [reviewId]: false }));
    }
  };

  const handleResponseChange = (id: string, value: string) => {
    setResponseText((prev) => ({ ...prev, [id]: value }));
  };

  const filteredReviewsBase =
    filter === "all"
      ? reviews
      : filter === "review"
        ? reviews.filter((r) => r.type === "Review")
        : reviews.filter((r) => r.type === "Complaint");

  const filteredReviews = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filteredReviewsBase;
    return filteredReviewsBase.filter((r) => {
      const name = (r.customerName || "").toLowerCase();
      const msg = (r.message || "").toLowerCase();
      return name.includes(q) || msg.includes(q);
    });
  }, [filteredReviewsBase, searchQuery]);

  const getUserTypeTag = (userType: string, fraudFlag = "") => {
    const config = {
      repeated: {
        icon: <UserCheck size={14} />,
        text: "Repeated User",
        bg: "bg-blue-50",
        textColor: "text-blue-700",
        border: "border-blue-100",
      },
      new: {
        icon: <UserPlus size={14} />,
        text: "New User",
        bg: "bg-green-50",
        textColor: "text-green-700",
        border: "border-green-100",
      },
      fraud: {
        icon: <UserX size={14} />,
        text: fraudFlag || "Fraud Risk",
        bg: "bg-red-50",
        textColor: "text-red-700",
        border: "border-red-100",
      },
    };

    const tag = config[userType as keyof typeof config] ?? config.new;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${tag.bg} ${tag.textColor} ${tag.border} border`}
      >
        {tag.icon}
        {tag.text}
      </span>
    );
  };

  const getReviewTypeTag = (type: string) => {
    return type === "Review" ? (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium border border-green-100">
        <Star size={12} />
        Review
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium border border-amber-100">
        <AlertTriangle size={12} />
        Complaint
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const sanitizeRichTextToPlainText = (input: string): string => {
    if (!input || typeof input !== "string") return "";
    let s = input;

    // Common rich-text artifacts (Quill / contenteditable)
    s = s.replace(/&nbsp;|&#160;/gi, " ");
    s = s.replace(/\u00a0/g, " ");
    s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
    s = s.replace(/<\s*\/\s*div\s*>\s*<\s*div\s*>/gi, "\n");
    s = s.replace(/<\s*div\s*>\s*<\s*br\s*\/?\s*>\s*<\s*\/\s*div\s*>/gi, "\n");
    s = s.replace(/<\s*\/\s*p\s*>\s*<\s*p\s*>/gi, "\n");

    // Drop remaining tags
    s = s.replace(/<[^>]*>/g, "");

    // Decode remaining HTML entities (client-only); fallback keeps raw.
    if (typeof window !== "undefined") {
      try {
        const el = document.createElement("textarea");
        el.innerHTML = s;
        s = el.value;
      } catch {
        // ignore
      }
    }

    // Normalize whitespace/newlines
    s = s.replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n");
    s = s.replace(/\n{3,}/g, "\n\n");
    s = s.replace(/[ \t]{2,}/g, " ");
    return s.trim();
  };

  const parseResponseMedia = (
    response: string,
  ): {
    text: string;
    images: string[];
    attachments: Array<{ url: string; kind?: string; name?: string }>;
  } => {
    if (!response || typeof response !== "string")
      return { text: response || "", images: [], attachments: [] };

    let text = response.trim();
    let images: string[] = [];
    let attachments: Array<{ url: string; kind?: string; name?: string }> = [];

    const attMatch = text.match(/\[ATTACHMENTS:([\s\S]*?)\]\s*$/);
    if (attMatch) {
      try {
        const parsed = JSON.parse(attMatch[1]);
        attachments = Array.isArray(parsed) ? parsed : [];
      } catch {
        attachments = [];
      }
      text = text.replace(/\n?\n?\[ATTACHMENTS:[\s\S]*?\]\s*$/, "").trim();
    }

    const imgMatch = text.match(/\[IMAGES:([\s\S]*?)\]\s*$/);
    if (imgMatch) {
      try {
        const parsed = JSON.parse(imgMatch[1]);
        images = Array.isArray(parsed) ? parsed : [];
      } catch {
        images = [];
      }
      text = text.replace(/\n?\n?\[IMAGES:[\s\S]*?\]\s*$/, "").trim();
    }

    return { text, images, attachments };
  };

  /** DB `attachments` column (text[] of JSON) — same as merchant app / dashboard. */
  function normalizeDbAttachments(raw: unknown): Array<{
    url: string;
    kind?: string;
    name?: string;
  }> {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    const out: Array<{ url: string; kind?: string; name?: string }> = [];
    for (const item of raw) {
      let rec: {
        storageKey?: string;
        url?: string;
        name?: string;
        mimeType?: string;
      } = {};
      if (typeof item === "string" && item.trim().startsWith("{")) {
        try {
          rec = JSON.parse(item) as typeof rec;
        } catch {
          continue;
        }
      } else if (item && typeof item === "object") {
        rec = item as typeof rec;
      } else continue;

      const key =
        typeof rec.storageKey === "string" ? rec.storageKey.trim() : "";
      const directUrl =
        typeof rec.url === "string" ? rec.url.trim() : "";
      const url = key
        ? getTicketAttachmentViewUrl(key)
        : getTicketAttachmentViewUrl(directUrl);
      if (!url) continue;
      const name =
        (typeof rec.name === "string" && rec.name.trim()) ||
        (key ? key.split("/").pop() : "") ||
        "Attachment";
      const mime = (
        typeof rec.mimeType === "string" ? rec.mimeType : ""
      ).toLowerCase();
      const lower = name.toLowerCase();
      let kind: string | undefined;
      if (
        mime.startsWith("image/") ||
        /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(lower)
      )
        kind = "image";
      else if (mime.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(lower))
        kind = "video";
      else if (
        mime.startsWith("audio/") ||
        /\.(mp3|wav|m4a|ogg|aac)$/i.test(lower)
      )
        kind = "audio";
      out.push({ url, kind, name });
    }
    return out;
  }

  function parseTicketMessageMedia(msg: {
    message_text?: string | null;
    attachments?: unknown;
  }): {
    text: string;
    images: string[];
    attachments: Array<{ url: string; kind?: string; name?: string }>;
  } {
    const parsed = parseResponseMedia(msg.message_text || "");
    const cleanText = sanitizeRichTextToPlainText(parsed.text || "");
    const fromDb = normalizeDbAttachments(
      (msg as { attachments?: unknown }).attachments,
    );
    if (fromDb.length > 0) {
      return {
        text: cleanText,
        images: fromDb
          .filter((a) => a.kind === "image")
          .map((a) => a.url),
        attachments: fromDb.filter((a) => a.kind !== "image"),
      };
    }
    return {
      text: cleanText,
      images: parsed.images,
      attachments: parsed.attachments,
    };
  }

  const getImageDisplayName = (urlOrKey: string): string => {
    if (!urlOrKey || typeof urlOrKey !== "string") return "Image";
    const s = urlOrKey.trim();
    try {
      if (s.startsWith("http://") || s.startsWith("https://")) {
        const u = new URL(s);
        const seg = u.pathname.split("/").filter(Boolean).pop();
        return seg ? decodeURIComponent(seg) : "Image";
      }
      const seg = s.split("/").filter(Boolean).pop();
      return seg ? decodeURIComponent(seg).split("?")[0] : "Image";
    } catch {
      return "Image";
    }
  };

  // Filter cards component for sidebar (mobile only)
  const ticketFilterCards = effectiveShowQueueView ? (
    <div className="space-y-2 md:hidden">
      <div className="text-xs font-semibold text-gray-700 mb-2 px-1">
        Ticket Filters
      </div>
      <div className="space-y-1.5">
        <button
          onClick={() => {
            setTicketStatusFilter(null);
            if (typeof window !== "undefined") {
              localStorage.setItem("userInsights_ticketStatusFilter", "");
              if (window.innerWidth < 768)
                window.dispatchEvent(new CustomEvent("closeMobileSidebar"));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === null
              ? "border-gray-900 ring-2 ring-gray-900"
              : "border-gray-200"
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Total</div>
          <div className="text-base font-bold text-gray-900">
            {tickets.length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter("OPEN");
            if (typeof window !== "undefined") {
              localStorage.setItem("userInsights_ticketStatusFilter", "OPEN");
              if (window.innerWidth < 768)
                window.dispatchEvent(new CustomEvent("closeMobileSidebar"));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === "OPEN"
              ? "border-blue-600 ring-2 ring-blue-600"
              : "border-blue-200"
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Open</div>
          <div className="text-base font-bold text-blue-600">
            {tickets.filter((t) => t.status === "OPEN").length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter("IN_PROGRESS");
            if (typeof window !== "undefined") {
              localStorage.setItem(
                "userInsights_ticketStatusFilter",
                "IN_PROGRESS",
              );
              if (window.innerWidth < 768)
                window.dispatchEvent(new CustomEvent("closeMobileSidebar"));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === "IN_PROGRESS"
              ? "border-yellow-600 ring-2 ring-yellow-600"
              : "border-yellow-200"
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">In Progress</div>
          <div className="text-base font-bold text-yellow-600">
            {tickets.filter((t) => t.status === "IN_PROGRESS").length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter("RESOLVED");
            if (typeof window !== "undefined") {
              localStorage.setItem(
                "userInsights_ticketStatusFilter",
                "RESOLVED",
              );
              if (window.innerWidth < 768)
                window.dispatchEvent(new CustomEvent("closeMobileSidebar"));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === "RESOLVED"
              ? "border-green-600 ring-2 ring-green-600"
              : "border-green-200"
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Resolved</div>
          <div className="text-base font-bold text-green-600">
            {tickets.filter((t) => t.status === "RESOLVED").length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter("PENDING");
            if (typeof window !== "undefined") {
              localStorage.setItem(
                "userInsights_ticketStatusFilter",
                "PENDING",
              );
              if (window.innerWidth < 768)
                window.dispatchEvent(new CustomEvent("closeMobileSidebar"));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === "PENDING"
              ? "border-amber-600 ring-2 ring-amber-600"
              : "border-amber-200"
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Pending</div>
          <div className="text-base font-bold text-amber-600">
            {tickets.filter((t) => t.status === "PENDING").length}
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter("REOPENED");
            if (typeof window !== "undefined") {
              localStorage.setItem(
                "userInsights_ticketStatusFilter",
                "REOPENED",
              );
              if (window.innerWidth < 768)
                window.dispatchEvent(new CustomEvent("closeMobileSidebar"));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === "REOPENED"
              ? "border-purple-600 ring-2 ring-purple-600"
              : "border-purple-200"
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Reopened</div>
          <div className="text-base font-bold text-purple-600">
            {
              tickets.filter(
                (t) =>
                  t.status === "REOPENED" ||
                  (t.status === "OPEN" && (t.resolved_at || t.reopened_at)),
              ).length
            }
          </div>
        </button>
        <button
          onClick={() => {
            setTicketStatusFilter("CLOSED");
            if (typeof window !== "undefined") {
              localStorage.setItem("userInsights_ticketStatusFilter", "CLOSED");
              if (window.innerWidth < 768)
                window.dispatchEvent(new CustomEvent("closeMobileSidebar"));
            }
          }}
          className={`w-full bg-white rounded-lg border p-2 shadow-sm hover:shadow-md transition-all text-left ${
            ticketStatusFilter === "CLOSED"
              ? "border-gray-600 ring-2 ring-gray-600"
              : "border-gray-200"
          }`}
        >
          <div className="text-[9px] text-gray-500 mb-0.5">Closed</div>
          <div className="text-base font-bold text-gray-600">
            {tickets.filter((t) => t.status === "CLOSED").length}
          </div>
        </button>
      </div>
    </div>
  ) : null;

  const partnerShellTitle = effectiveShowQueueView ? "Support Inbox" : "User Insights";

  const partnerShellSubtitle = effectiveShowQueueView
    ? "Manage and reply to your support tickets"
    : "Monitor customer feedback and respond to reviews";

  return (
    <MXLayoutWhite
      restaurantName={store?.store_name}
      restaurantId={storeId || DEMO_STORE_ID}
      sidebarFilters={ticketFilterCards}
    >
      <PartnerShellHeaderSync title={partnerShellTitle} subtitle={partnerShellSubtitle} />
      <div
        className={`w-full flex-1 min-h-0 flex flex-col overflow-hidden ${
          effectiveShowQueueView
            ? "p-2 sm:p-3 lg:p-4"
            : "relative p-3 sm:p-4 lg:p-5"
        }`}
      >
        {/* Show Queue View or User Insights */}
        {effectiveShowQueueView ? (
          showTicketDetail && selectedTicket ? (
            /* Ticket Detail Panel — full-height split; scroll only inside columns */
            <React.Fragment>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:flex-row md:gap-4">
                {/* Desktop: left ticket list */}
                <div className="hidden h-full min-h-0 md:flex md:w-[420px] md:shrink-0 md:flex-col md:overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          All tickets
                        </h3>
                        <p className="text-xs text-gray-500 truncate">
                          Support Inbox
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowTicketDetail(false);
                          setSelectedTicket(null);
                          if (typeof window !== "undefined")
                            localStorage.removeItem(
                              "userInsights_selectedTicketId",
                            );
                          router.replace(
                            `${pathname ?? "/mx/user-insights"}?view=inbox`,
                          );
                        }}
                        className="text-xs font-medium text-orange-700 hover:underline"
                      >
                        Back
                      </button>
                    </div>
                    <div className="mt-3">
                      <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 bg-white">
                        <Calendar size={14} className="text-gray-500" />
                        <select
                          value={datePreset}
                          onChange={(e) => {
                            const v = e.target.value as
                              | "7d"
                              | "15d"
                              | "1m"
                              | "3m"
                              | "365d"
                              | "custom";
                            if (v === "custom") {
                              openCustomDatePicker();
                            } else {
                              applyDatePreset(v);
                            }
                          }}
                          className="bg-transparent outline-none text-xs font-medium text-gray-800"
                          aria-label="Select date range preset"
                        >
                          <option value="7d">Last 7 days</option>
                          <option value="15d">Last 15 days</option>
                          <option value="1m">Last 1 month</option>
                          <option value="3m">Last 3 months</option>
                          <option value="365d">Last 365 days</option>
                          <option value="custom">Custom</option>
                        </select>
                        <span className="text-gray-400">•</span>
                        <span className="whitespace-nowrap text-gray-600">
                          {formatRangeSummary(dateFrom, dateTo)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto scrollbar-hide p-3 space-y-2">
                    {filteredTickets.length > 0 ? (
                      filteredTickets.map((ticket) => (
                        <button
                          key={ticket.id}
                          onClick={() => handleTicketClick(ticket)}
                          className={`w-full text-left rounded-lg border p-3 transition-all hover:shadow-md ${
                            selectedTicket?.id === ticket.id
                              ? "border-orange-500 ring-2 ring-orange-500/20 bg-orange-50/40"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-xs text-gray-500 font-mono">
                              #{ticket.ticket_id}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(ticket.created_at).toLocaleDateString(
                                "en-IN",
                                { day: "numeric", month: "short" },
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                ticket.status === "OPEN"
                                  ? "bg-blue-50 text-blue-700"
                                  : ticket.status === "IN_PROGRESS"
                                    ? "bg-yellow-50 text-yellow-700"
                                    : ticket.status === "PENDING"
                                      ? "bg-amber-50 text-amber-700"
                                      : ticket.status === "REOPENED"
                                        ? "bg-purple-50 text-purple-700"
                                        : ticket.status === "RESOLVED"
                                          ? "bg-green-50 text-green-700"
                                          : "bg-gray-50 text-gray-700"
                              }`}
                            >
                              {ticket.status || "OPEN"}
                            </span>
                            <span className="text-xs text-gray-700 font-medium line-clamp-1">
                              {ticket.subject}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 line-clamp-2">
                            {ticket.description}
                          </p>
                        </button>
                      ))
                    ) : (
                      <div className="text-center py-10">
                        <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Inbox className="text-gray-400" size={28} />
                        </div>
                        <h3 className="text-base font-semibold text-gray-700 mb-1">
                          No tickets yet
                        </h3>
                        <p className="text-sm text-gray-500">
                          Your store tickets will appear here
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: ticket detail */}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
                    {/* Chat Header (reference-like, compact) */}
                    <div className="flex-shrink-0 bg-white border-b border-gray-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            onClick={handleBackToQueue}
                            className="p-2 hover:bg-gray-100 rounded-xl transition-colors flex-shrink-0 md:hidden"
                            aria-label="Back"
                            title="Back"
                            type="button"
                          >
                            <ChevronLeft size={20} className="text-gray-700" />
                          </button>
                          <div className="h-11 w-11 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold flex-shrink-0">
                            {twoLetterInitials(store?.store_name || "St")}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <h3 className="text-sm sm:text-base font-semibold text-gray-900 truncate max-w-[min(460px,60vw)]">
                                {selectedTicket?.subject || "Support ticket"}
                              </h3>
                              <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                                {selectedTicket?.status || "OPEN"}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                                {selectedTicket?.priority || "MEDIUM"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 truncate">
                              Active • #{selectedTicket?.ticket_id}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0" />
                      </div>

                      {/* Status + priority moved beside heading */}
                    </div>

                    {/* Chat Messages (reference-like) */}
                    <div
                      ref={chatContainerRef}
                      className="flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-white to-orange-50/40 p-3 sm:p-4 scrollbar-hide"
                    >
                      {messagesLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="animate-spin h-6 w-6 text-orange-600" />
                        </div>
                      ) : (
                        <>
                          {/* Date separator */}
                          <div className="flex justify-center py-2">
                            <div className="px-3 py-1 rounded-full bg-white/80 border border-gray-200 text-[11px] text-gray-600">
                              {new Date(selectedTicket.created_at).toLocaleDateString(
                                "en-IN",
                                { day: "numeric", month: "short", year: "numeric" },
                              )}
                            </div>
                          </div>

                          {/* Original ticket (alignment follows who raised it) */}
                          {(() => {
                            const st = selectedTicket;
                            const outbound = ticketOriginalMessageOutbound(
                              st.raised_by_type,
                            );
                            const extra = st as {
                              raised_by_photo_url?: string | null;
                            };
                            const photoUrl =
                              typeof extra.raised_by_photo_url === "string" &&
                              extra.raised_by_photo_url.trim()
                                ? extra.raised_by_photo_url.trim()
                                : null;
                            const labelName =
                              st.raised_by_name?.trim() ||
                              (outbound
                                ? store?.store_name || "You"
                                : "Customer");
                            return (
                              <div
                                className={`mb-4 flex min-w-0 items-end gap-2 ${
                                  outbound ? "justify-end" : "justify-start"
                                }`}
                              >
                                {!outbound ? (
                                  <ThreadAvatarBubble
                                    imageUrl={photoUrl}
                                    labelName={labelName}
                                    className="mt-0.5 bg-gradient-to-br from-blue-500 to-blue-600"
                                    textClassName="text-white"
                                  />
                                ) : null}
                                <div
                                  className={`flex min-w-0 max-w-[78%] flex-col gap-1 sm:max-w-[70%] md:max-w-[62%] ${
                                    outbound ? "items-end" : "items-start"
                                  }`}
                                >
                                  <div
                                    className={`mb-0.5 w-full min-w-0 overflow-hidden px-1 ${
                                      outbound ? "text-right" : ""
                                    }`}
                                  >
                                    <span className="block truncate text-[10px] font-medium text-gray-600 sm:text-xs">
                                      {outbound
                                        ? "You"
                                        : labelName}
                                    </span>
                                  </div>
                                  <div
                                    className={`min-w-0 w-full break-words rounded-2xl px-3 py-2 shadow-sm sm:px-3.5 sm:py-2 ${
                                      outbound
                                        ? "rounded-br-sm bg-orange-600 text-white"
                                        : "rounded-bl-sm bg-gray-100 text-gray-900"
                                    }`}
                                  >
                                    <p
                                      className={`text-sm sm:text-base whitespace-pre-wrap leading-relaxed break-words ${
                                        outbound ? "text-white" : "text-gray-900"
                                      }`}
                                    >
                                      {sanitizeRichTextToPlainText(String(st.description || ""))}
                                    </p>
                                    {st.attachments &&
                                      st.attachments.length > 0 && (
                                        <div className="mt-1.5 space-y-1">
                                          {st.attachments.map(
                                            (url: string, idx: number) => {
                                              const href =
                                                getTicketAttachmentViewUrl(url);
                                              return (
                                                <a
                                                  key={idx}
                                                  href={href}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="block max-w-[200px] overflow-hidden rounded-md border border-white/30 bg-white/10 sm:max-w-[220px]"
                                                >
                                                  <img
                                                    src={href}
                                                    alt={`Attachment ${idx + 1}`}
                                                    className="max-h-28 w-full cursor-pointer object-cover transition-opacity hover:opacity-90 sm:max-h-32"
                                                  />
                                                </a>
                                              );
                                            },
                                          )}
                                        </div>
                                      )}
                                  </div>
                                  <span
                                    className={`w-full flex-shrink-0 px-1 text-[10px] text-gray-500 ${
                                      outbound ? "text-right" : ""
                                    }`}
                                  >
                                    {formatTime(st.created_at)}
                                  </span>
                                </div>
                                {outbound ? (
                                  <ThreadAvatarBubble
                                    imageUrl={null}
                                    labelName={store?.store_name || "St"}
                                    className="bg-gradient-to-br from-orange-500 to-orange-600"
                                    textClassName="text-white"
                                  />
                                ) : null}
                              </div>
                            );
                          })()}

                          {/* All Messages from Database */}
                          {ticketMessages.map((msg, idx) => {
                            const isMerchant = msg.sender_type === "MERCHANT";
                            const isAgent = msg.sender_type === "AGENT";
                            const isCustomer = msg.sender_type === "CUSTOMER";
                            const { text, images, attachments } =
                              parseTicketMessageMedia(msg);
                            const prev = ticketMessages[idx - 1];
                            const day =
                              new Date(msg.created_at).toLocaleDateString("en-IN", {
                                day: "numeric",
                                month: "short",
                                year: "numeric",
                              });
                            const prevDay = prev
                              ? new Date(prev.created_at).toLocaleDateString(
                                  "en-IN",
                                  { day: "numeric", month: "short", year: "numeric" },
                                )
                              : null;
                            const showSenderLabel =
                              idx === 0 ||
                              (idx > 0 &&
                                ticketMessages[idx - 1].sender_type !==
                                  msg.sender_type) ||
                              new Date(msg.created_at).getTime() -
                                new Date(
                                  ticketMessages[idx - 1]?.created_at ||
                                    msg.created_at,
                                ).getTime() >
                                300000; // 5 minutes

                            return (
                              <React.Fragment key={msg.id}>
                                {idx === 0 || day !== prevDay ? (
                                  <div className="flex justify-center py-2">
                                    <div className="px-3 py-1 rounded-full bg-white/80 border border-gray-200 text-[11px] text-gray-600">
                                      {day}
                                    </div>
                                  </div>
                                ) : null}

                                <div
                                  className={`flex items-end gap-1.5 mb-2 min-w-0 ${
                                    isMerchant ? "justify-end" : "justify-start"
                                  }`}
                                >
                                {/* Avatar (incoming only — left) */}
                                {showSenderLabel && !isMerchant && (
                                  <ThreadAvatarBubble
                                    imageUrl={
                                      (msg as { sender_photo_url?: string })
                                        .sender_photo_url ||
                                      (msg as { sender_avatar_url?: string })
                                        .sender_avatar_url
                                    }
                                    labelName={
                                      isAgent
                                        ? "GM"
                                        : msg.sender_name ||
                                          (isCustomer ? "Customer" : "Support")
                                    }
                                    className={`mt-0.5 ${
                                      isAgent
                                        ? "bg-gradient-to-br from-[#25D366] to-[#128C7E]"
                                        : "bg-gradient-to-br from-blue-500 to-blue-600"
                                    }`}
                                    textClassName="text-white"
                                  />
                                )}
                                {!showSenderLabel && !isMerchant && (
                                  <div className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" />
                                )}

                                <div
                                  className={`flex min-w-0 max-w-[60%] flex-col gap-0.5 sm:max-w-[60%] md:max-w-[60%] ${
                                    isMerchant
                                      ? "items-stretch self-end"
                                      : "items-start"
                                  }`}
                                >
                                  {/* Sender Label - Only for GatiMitra Team or new merchant messages */}
                                  {showSenderLabel && (
                                    <div
                                      className={`mb-0.5 px-1 min-w-0 overflow-hidden w-full ${isMerchant ? "text-right" : ""}`}
                                    >
                                      {isAgent ? (
                                        <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate block">
                                          Responded by GatiMitra Team
                                        </span>
                                      ) : isMerchant ? (
                                        <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate block">
                                          You
                                        </span>
                                      ) : (
                                        <span className="text-[10px] sm:text-xs text-gray-600 font-medium truncate block">
                                          {msg.sender_name ||
                                            (isCustomer
                                              ? "Customer"
                                              : "Merchant")}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Text + inline images only (media stays out). Skip empty bubble so audio/video/file-only messages do not show a stray strip. */}
                                  {(Boolean(text?.trim()) || images.length > 0) && (
                                    <div
                                      className={`min-w-0 w-full break-words rounded-2xl px-3 py-2 shadow-sm ${
                                        isMerchant
                                          ? "rounded-br-sm bg-orange-600 text-white"
                                          : "rounded-bl-sm bg-gray-100 text-gray-900"
                                      }`}
                                    >
                                      {text && (
                                        <p
                                          className={`text-[13px] sm:text-sm whitespace-pre-wrap leading-snug break-words ${
                                            isMerchant ? "text-white" : "text-gray-900"
                                          }`}
                                        >
                                          {text}
                                        </p>
                                      )}

                                      {images.length > 0 && (
                                        <div
                                          className={`mt-1.5 ${images.length > 1 ? "grid grid-cols-2 gap-1" : "space-y-1"}`}
                                        >
                                          {images.map((img, imgIdx) => {
                                            const href =
                                              getTicketAttachmentViewUrl(img);
                                            return (
                                              <div key={imgIdx} className="space-y-0.5">
                                                <a
                                                  href={href}
                                                  target="_blank"
                                                  rel="noreferrer"
                                                  className="block max-w-[180px] overflow-hidden rounded-md border border-white/25 sm:max-w-[200px]"
                                                >
                                                  <img
                                                    src={href}
                                                    alt={getImageDisplayName(img)}
                                                    className="max-h-24 w-full cursor-pointer object-cover transition-opacity hover:opacity-90 sm:max-h-28"
                                                    loading="lazy"
                                                  />
                                                </a>
                                                <p
                                                  className="text-[9px] text-gray-500 truncate sm:text-[10px]"
                                                  title={getImageDisplayName(img)}
                                                >
                                                  {getImageDisplayName(img)}
                                                </p>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {attachments.length > 0 && (
                                    <div className="mt-1 flex w-full min-w-0 max-w-full flex-col gap-1 self-stretch">
                                      {attachments.map((a, attIdx) => {
                                        const url = getTicketAttachmentViewUrl(
                                          a.url,
                                        );
                                        const resolvedKind =
                                          inferMediaAttachmentKind(
                                            a.url || "",
                                            a.kind,
                                          );
                                        if (resolvedKind === "video") {
                                          return (
                                            <video
                                              key={`${attIdx}-${url.slice(-24)}`}
                                              controls
                                              playsInline
                                              className="max-h-36 w-full min-w-0 max-w-full rounded-lg border border-gray-200 bg-black object-contain shadow-sm"
                                            >
                                              <source src={url} />
                                            </video>
                                          );
                                        }
                                        if (resolvedKind === "audio") {
                                          return (
                                            <TicketVoiceNotePlayer
                                              key={`${attIdx}-${url.slice(-24)}`}
                                              src={url}
                                              outgoing={isMerchant}
                                            />
                                          );
                                        }
                                        return (
                                          <a
                                            key={attIdx}
                                            href={url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="inline-flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 shadow-sm hover:bg-gray-50"
                                          >
                                            <Paperclip size={12} className="shrink-0" />
                                            <span className="truncate">
                                              {a.name || "Attachment"}
                                            </span>
                                          </a>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {/* Timestamp - own row with gap so no overlap */}
                                  <span className={`text-[10px] text-gray-500 flex-shrink-0 px-1 w-full ${isMerchant ? "text-right" : ""}`}>
                                    {formatTime(msg.created_at)}
                                  </span>
                                </div>

                                {isMerchant && (
                                  <ThreadAvatarBubble
                                    imageUrl={null}
                                    labelName={store?.store_name || "St"}
                                    className="bg-gradient-to-br from-orange-500 to-orange-600"
                                    textClassName="text-white"
                                  />
                                )}
                              </div>
                              </React.Fragment>
                            );
                          })}

                          {/* Resolution Message - GatiMitra Team (Left Aligned) */}
                          {selectedTicket.resolution && (
                            <>
                              <div className="flex justify-center my-2">
                                <div className="px-2.5 py-0.5 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full text-[10px] sm:text-xs text-gray-600 flex items-center gap-1 shadow-sm">
                                  <CheckCircle size={10} />
                                  Ticket Resolved
                                </div>
                              </div>
                              <div className="flex items-start gap-1.5 mb-3">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-[#25D366] to-[#128C7E] rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5 text-[11px] font-semibold">
                                  GM
                                </div>
                                <div className="flex flex-col gap-1 min-w-0 max-w-[75%] sm:max-w-[70%] md:max-w-[65%] lg:max-w-[60%]">
                                  <div className="mb-0.5 px-1 min-w-0">
                                    <span className="text-[10px] sm:text-xs text-gray-600 font-medium">
                                      Responded by GatiMitra Team
                                    </span>
                                  </div>
                                  <div className="bg-[#DCF8C6] rounded-2xl rounded-tl-sm px-3 py-2 sm:px-4 sm:py-2 shadow-sm break-words w-full">
                                    <p className="text-sm sm:text-base text-gray-900 whitespace-pre-wrap leading-relaxed break-words">
                                      {selectedTicket.resolution}
                                    </p>
                                  </div>
                                  <span className="text-[9px] text-gray-500 flex-shrink-0 px-1">
                                    {selectedTicket.resolved_at &&
                                      formatTime(selectedTicket.resolved_at)}
                                  </span>
                                </div>
                              </div>
                            </>
                          )}

                          {/* Ticket Closing, Rating & Reopen Section - Compact Inline Panel */}
                          {(normalizedTicketStatus(selectedTicket.status) ===
                            "CLOSED" ||
                            normalizedTicketStatus(selectedTicket.status) ===
                              "RESOLVED") && (
                            <>
                              {/* Closing Banner - Compact */}
                              <div className="flex justify-center my-2 px-2">
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5 shadow-sm animate-fade-in">
                                  <CheckCircle
                                    size={12}
                                    className="text-green-600 flex-shrink-0"
                                  />
                                  <span className="text-[10px] sm:text-xs font-medium text-gray-800">
                                    {normalizedTicketStatus(
                                      selectedTicket.status,
                                    ) === "CLOSED"
                                      ? "This ticket is permanently closed"
                                      : "This conversation has been closed"}
                                  </span>
                                </div>
                              </div>

                              {/* CLOSED: no reopen option */}
                              {normalizedTicketStatus(selectedTicket.status) ===
                                "CLOSED" && (
                                <div className="px-2 sm:px-3 mb-2">
                                  <p className="text-[10px] sm:text-xs text-gray-500 text-center">
                                    Reopening is not available for closed
                                    tickets.
                                  </p>
                                </div>
                              )}

                              {/* Rating Panel - Compact, Redirects on Click (RESOLVED only) */}
                              {normalizedTicketStatus(selectedTicket.status) ===
                                "RESOLVED" &&
                                !selectedTicket.satisfaction_rating && (
                                  <div className="px-2 sm:px-3 mb-2 animate-fade-in">
                                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5 sm:p-3">
                                      {/* Rating Prompt - Compact */}
                                      <p className="text-[10px] sm:text-xs text-gray-700 mb-2 text-center">
                                        Please rate your overall experience with
                                        our support
                                      </p>

                                      {/* Emoji Rating System - Compact */}
                                      <div className="mb-2">
                                        <p className="text-[9px] sm:text-[10px] text-gray-600 mb-1.5 text-center">
                                          How well were we able to solve your
                                          problem?
                                        </p>
                                        <div className="flex justify-center items-center gap-1 sm:gap-1.5 flex-wrap">
                                          {[
                                            {
                                              value: 1,
                                              emoji: "😠",
                                              label: "Very Poor",
                                            },
                                            {
                                              value: 2,
                                              emoji: "😢",
                                              label: "Poor",
                                            },
                                            {
                                              value: 3,
                                              emoji: "😐",
                                              label: "Neutral",
                                            },
                                            {
                                              value: 4,
                                              emoji: "😊",
                                              label: "Good",
                                            },
                                            {
                                              value: 5,
                                              emoji: "😍",
                                              label: "Excellent",
                                            },
                                          ].map(({ value, emoji, label }) => (
                                            <button
                                              key={value}
                                              onClick={() => {
                                                setTicketRating(value);
                                                setShowRatingModal(true);
                                              }}
                                              className="flex flex-col items-center gap-0.5 p-1 sm:p-1.5 rounded-lg transition-all duration-200 bg-gray-50 hover:bg-gray-100 hover:scale-105"
                                            >
                                              <span className="text-lg sm:text-xl">
                                                {emoji}
                                              </span>
                                              <span className="text-[8px] sm:text-[9px] font-medium text-gray-500">
                                                {label}
                                              </span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                              {/* Already Rated Display - Compact */}
                              {normalizedTicketStatus(selectedTicket.status) ===
                                "RESOLVED" &&
                                selectedTicket.satisfaction_rating && (
                                  <div className="px-2 sm:px-3 mb-2">
                                    <div className="bg-green-50 rounded-lg border border-green-200 p-2.5 sm:p-3">
                                      <p className="text-[10px] sm:text-xs text-gray-700 mb-0.5 text-center">
                                        <span className="font-semibold">
                                          Thank you! You rated this ticket{" "}
                                        </span>
                                        <span className="inline-flex items-center gap-0.5">
                                          {Array.from({
                                            length:
                                              selectedTicket.satisfaction_rating,
                                          }).map((_: unknown, i: number) => (
                                            <Star
                                              key={i}
                                              size={12}
                                              className="text-yellow-400 fill-current"
                                            />
                                          ))}
                                        </span>
                                      </p>
                                      {selectedTicket.satisfaction_feedback && (
                                        <p className="text-[9px] sm:text-[10px] text-gray-600 text-center italic mt-0.5">
                                          "
                                          {selectedTicket.satisfaction_feedback}
                                          "
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                )}

                              {/* Chat with Us - RESOLVED only (never for CLOSED) */}
                              {normalizedTicketStatus(selectedTicket.status) ===
                                "RESOLVED" && (
                                <div className="px-2 sm:px-3 mb-2">
                                  <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2.5 sm:p-3">
                                    <p className="text-[9px] sm:text-[10px] text-gray-600 mb-1.5 text-center">
                                      Still having an issue?
                                    </p>
                                    <button
                                      onClick={() =>
                                        handleReopenTicket(selectedTicket.id)
                                      }
                                      disabled={reopenInProgress}
                                      className="w-full px-3 py-1.5 bg-orange-600 text-white rounded-lg font-medium text-[10px] sm:text-xs hover:bg-orange-700 transition-all duration-200 flex items-center justify-center gap-1.5 shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                      {reopenInProgress ? (
                                        <>
                                          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                                          Opening chat…
                                        </>
                                      ) : (
                                        <>
                                          <svg
                                            className="w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                                            />
                                          </svg>
                                          Chat with us
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          )}

                          {/* Scroll anchor */}
                          <div ref={messagesEndRef} />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Chat Input - right pane only */}
                  {normalizedTicketStatus(selectedTicket.status) !==
                    "CLOSED" && (
                    <div
                      className="flex-shrink-0 bg-white/90 backdrop-blur border-t border-gray-200 p-2 sm:p-3"
                      style={{
                        paddingBottom:
                          "env(safe-area-inset-bottom, 0px)",
                      }}
                    >
                      <div className="w-full">
                        {/* Image Previews */}
                        {ticketReplyImages.length > 0 && (
                          <div className="flex flex-wrap gap-2 mb-2 pb-2 border-b border-gray-200">
                            {ticketReplyImages.map((img, idx) => (
                              <div key={idx} className="relative group">
                                {img.kind === "image" ? (
                                  <img
                                    src={img.preview}
                                    alt={`Preview ${idx + 1}`}
                                    className={`w-16 h-16 object-cover rounded-xl border shadow-sm ${
                                      img.uploadProgress === -1
                                        ? "border-red-300"
                                        : "border-gray-200"
                                    }`}
                                  />
                                ) : (
                                  <div
                                    className={`w-16 h-16 rounded-xl border shadow-sm flex flex-col items-center justify-center gap-1 ${
                                      img.uploadProgress === -1
                                        ? "border-red-300 bg-red-50"
                                        : "border-gray-200 bg-gray-50"
                                    }`}
                                  >
                                    {img.kind === "video" ? (
                                      <Video
                                        size={18}
                                        className="text-gray-600"
                                      />
                                    ) : (
                                      <Mic
                                        size={18}
                                        className="text-gray-600"
                                      />
                                    )}
                                    <span className="text-[9px] text-gray-600 px-1 truncate max-w-[60px]">
                                      {img.name || img.file.name}
                                    </span>
                                  </div>
                                )}
                                {img.uploadProgress >= 0 &&
                                  img.uploadProgress < 100 && (
                                    <div className="absolute inset-0 bg-black bg-opacity-50 rounded-lg flex items-center justify-center">
                                      <Loader2 className="animate-spin h-3.5 w-3.5 text-white" />
                                    </div>
                                  )}
                                {img.uploadProgress === -1 && (
                                  <div className="absolute inset-0 bg-red-900/30 rounded-lg flex items-center justify-center">
                                    <span className="text-[9px] font-semibold text-white px-1 text-center">
                                      Failed
                                    </span>
                                  </div>
                                )}
                                <button
                                  onClick={() => removeTicketImage(idx)}
                                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 shadow-md hover:bg-red-600 transition-colors"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Input Area */}
                        <div className="flex items-end gap-1.5 bg-white rounded-3xl px-2 sm:px-2.5 py-1 sm:py-1.5 shadow-sm border border-gray-200">
                          <input
                            ref={ticketReplyFileInputRef}
                            type="file"
                            accept="image/*,video/*,audio/*"
                            multiple
                            className="hidden"
                            onChange={(e) =>
                              handleTicketImageSelect(e.target.files)
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              normalizedTicketStatus(selectedTicket.status) !==
                                "CLOSED" &&
                              ticketReplyFileInputRef.current?.click()
                            }
                            disabled={
                              normalizedTicketStatus(selectedTicket.status) ===
                              "CLOSED"
                            }
                            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                            title="Attach media"
                          >
                            <Paperclip size={18} className="sm:w-4 sm:h-4" />
                          </button>
                          <textarea
                            ref={ticketReplyTextareaRef}
                            value={ticketReply}
                            onChange={(e) => {
                              setTicketReply(e.target.value);
                              // Auto-resize textarea
                              e.target.style.height = "auto";
                              e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
                            }}
                            placeholder="Type a message"
                            rows={1}
                            disabled={
                              normalizedTicketStatus(selectedTicket.status) ===
                              "CLOSED"
                            }
                            className="flex-1 min-h-[24px] px-2 sm:px-2.5 py-1.5 text-sm sm:text-base bg-transparent border-none focus:outline-none resize-none max-h-[100px] scrollbar-hide disabled:opacity-60 disabled:cursor-not-allowed"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (
                                  (ticketReply.trim() ||
                                    ticketReplyImages.length > 0) &&
                                  !replyLoading &&
                                  normalizedTicketStatus(
                                    selectedTicket.status,
                                  ) !== "CLOSED"
                                ) {
                                  handleSendReply();
                                }
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleSendReply();
                            }}
                            disabled={
                              normalizedTicketStatus(selectedTicket.status) ===
                                "CLOSED" ||
                              (!ticketReply.trim() &&
                                ticketReplyImages.length === 0) ||
                              replyLoading
                            }
                            className={`p-1.5 rounded-full flex-shrink-0 transition-all ${
                              (ticketReply.trim() ||
                                ticketReplyImages.length > 0) &&
                              !replyLoading
                                ? "bg-[#25D366] text-white hover:bg-[#20BA5A] shadow-md"
                                : "bg-gray-200 text-gray-400 cursor-not-allowed"
                            }`}
                            title="Send message"
                          >
                            {replyLoading ? (
                              <Loader2 className="animate-spin h-4 w-4" />
                            ) : (
                              <Send size={18} className="sm:w-4 sm:h-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] sm:text-xs text-gray-500 mt-1.5 text-center">
                          Press Enter to send • Shift+Enter for new line
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {showRatingModal && selectedTicket ? (
                <div
                  className="fixed left-0 right-0 bottom-0 top-14 z-[999] flex justify-end"
                  role="presentation"
                >
                  <button
                    type="button"
                    className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
                    aria-label="Close feedback"
                    onClick={() => setShowRatingModal(false)}
                  />
                  <aside
                    className="relative h-full w-full max-w-md border-l border-gray-200 bg-white shadow-2xl flex flex-col"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Rate your experience"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          Ticket feedback
                        </p>
                        <h2 className="text-base font-bold text-gray-900 truncate">
                          Rate your experience
                        </h2>
                        <p className="text-xs text-gray-500 truncate">
                          #{selectedTicket.ticket_id}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                        aria-label="Close"
                        onClick={() => setShowRatingModal(false)}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-4">
                      <h3 className="text-lg font-semibold text-gray-900 text-center">
                        How was your overall experience?
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 text-center">
                        How well were we able to solve your problem?
                      </p>

                      <div className="mt-5 flex justify-center items-center gap-3 flex-wrap">
                        {[
                          { value: 1, emoji: "😠", label: "Very Poor" },
                          { value: 2, emoji: "😢", label: "Poor" },
                          { value: 3, emoji: "😐", label: "Neutral" },
                          { value: 4, emoji: "😊", label: "Good" },
                          { value: 5, emoji: "😍", label: "Excellent" },
                        ].map(({ value, emoji, label }) => {
                          const active = ticketRating === value;
                          const good = value >= 4;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setTicketRating(value)}
                              className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 border ${
                                active
                                  ? good
                                    ? "bg-green-50 border-green-300 ring-2 ring-green-200 scale-[1.03]"
                                    : "bg-red-50 border-red-300 ring-2 ring-red-200 scale-[1.03]"
                                  : "bg-gray-50 border-transparent hover:bg-gray-100 hover:scale-[1.02]"
                              }`}
                            >
                              <span className="text-3xl">{emoji}</span>
                              <span
                                className={`text-xs font-medium ${
                                  active
                                    ? good
                                      ? "text-green-700"
                                      : "text-red-700"
                                    : "text-gray-600"
                                }`}
                              >
                                {label}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {ticketRating != null && ticketRating >= 3 ? (
                        <div className="mt-6">
                          <p className="text-sm font-medium text-gray-700 mb-2">
                            What did you like about our support?
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[
                              "Resolution was fair",
                              "Quick support",
                              "Helpful agent",
                              "Clear communication",
                            ].map((tag) => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  const cur = ticketRatingFeedback || "";
                                  const has = cur
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean)
                                    .includes(tag);
                                  if (has) {
                                    const next = cur
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter((s) => s && s !== tag)
                                      .join(", ");
                                    setTicketRatingFeedback(next);
                                  } else {
                                    const next = cur.trim()
                                      ? `${cur.trim()}, ${tag}`
                                      : tag;
                                    setTicketRatingFeedback(next);
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border-2 transition-colors ${
                                  (ticketRatingFeedback || "")
                                    .split(",")
                                    .map((s) => s.trim())
                                    .includes(tag)
                                    ? "bg-orange-100 text-orange-700 border-orange-300"
                                    : "bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200"
                                }`}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div className="mt-5">
                        <textarea
                          value={ticketRatingFeedback}
                          onChange={(e) => setTicketRatingFeedback(e.target.value)}
                          placeholder="Share your feedback (optional)..."
                          rows={4}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="flex-shrink-0 border-t border-gray-200 p-4 bg-white">
                      <button
                        type="button"
                        onClick={() => void handleSubmitRating()}
                        disabled={ratingLoading || !ticketRating}
                        className={`w-full px-6 py-3 rounded-lg font-medium text-base transition-all duration-200 flex items-center justify-center gap-2 ${
                          ratingLoading || !ticketRating
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-orange-600 text-white hover:bg-orange-700 shadow-md"
                        }`}
                      >
                        {ratingLoading ? (
                          <>
                            <Loader2 className="animate-spin h-5 w-5" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Feedback"
                        )}
                      </button>
                    </div>
                  </aside>
                </div>
              ) : null}
            </React.Fragment>
          ) : (
            /* Queue View - Full Page */
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
              {/* Left: filtered ticket list */}
              <div className="flex h-full min-h-0 w-full shrink-0 flex-col border-r border-gray-200 bg-white md:h-auto md:w-[420px]">
                <div className="p-3 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <MobileHamburgerButton />
                    <div className="flex-1 min-w-0">
                      <input
                        value={ticketSearch}
                        onChange={(e) => setTicketSearch(e.target.value)}
                        placeholder="Search your issue"
                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-gray-900">
                      All tickets
                    </h3>
                    <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700">
                      <Calendar size={14} className="text-gray-500" />
                      <select
                        value={datePreset}
                        onChange={(e) => {
                          const v = e.target.value as
                            | "7d"
                            | "15d"
                            | "1m"
                            | "3m"
                            | "365d"
                            | "custom";
                          if (v === "custom") {
                            openCustomDatePicker();
                          } else {
                            applyDatePreset(v);
                          }
                        }}
                        className="bg-transparent outline-none text-xs font-medium text-gray-800"
                        aria-label="Select date range preset"
                      >
                        <option value="7d">Last 7 days</option>
                        <option value="15d">Last 15 days</option>
                        <option value="1m">Last 1 month</option>
                        <option value="3m">Last 3 months</option>
                        <option value="365d">Last 365 days</option>
                        <option value="custom">Custom</option>
                      </select>
                      <span className="text-gray-400">•</span>
                      <span className="whitespace-nowrap text-gray-600">
                        {formatRangeSummary(dateFrom, dateTo)}
                      </span>
                      <ChevronDown size={14} className="text-gray-500" />
                    </div>
                  </div>
                </div>

                {datePopoverOpen && (
                  <DateRangePopover
                    calMonth={calMonth}
                    setCalMonth={setCalMonth}
                    rangeSel={rangeSel}
                    setRangeSel={setRangeSel}
                    onClose={() => setDatePopoverOpen(false)}
                    onApply={() => {
                      if (rangeSel.a && rangeSel.b) {
                        const t1 = parseYmd(rangeSel.a).getTime();
                        const t2 = parseYmd(rangeSel.b).getTime();
                        const [from, to] =
                          t1 <= t2
                            ? [rangeSel.a, rangeSel.b]
                            : [rangeSel.b, rangeSel.a];
                        setDateFrom(from);
                        setDateTo(to);
                        setDatePreset("custom");
                      }
                      setDatePopoverOpen(false);
                    }}
                  />
                )}

                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
                  {ticketsLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="animate-pulse bg-white rounded-lg border border-gray-200 p-3"
                      >
                        <div className="h-3 bg-gray-200 rounded w-1/3 mb-2" />
                        <div className="h-2.5 bg-gray-200 rounded w-full mb-1" />
                        <div className="h-2.5 bg-gray-200 rounded w-2/3" />
                      </div>
                    ))
                  ) : filteredTickets.length > 0 ? (
                    filteredTickets.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => handleTicketClick(ticket)}
                        className="w-full text-left bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md hover:border-orange-300 transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                ticket.status === "REOPENED"
                                  ? "bg-purple-50 text-purple-700"
                                  : ticket.status === "OPEN"
                                    ? "bg-blue-50 text-blue-700"
                                    : ticket.status === "IN_PROGRESS"
                                      ? "bg-yellow-50 text-yellow-700"
                                      : ticket.status === "RESOLVED"
                                        ? "bg-green-50 text-green-700"
                                        : "bg-gray-50 text-gray-700"
                              }`}
                            >
                              {ticket.status || "OPEN"}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                ticket.priority === "HIGH"
                                  ? "bg-red-50 text-red-700"
                                  : ticket.priority === "URGENT"
                                    ? "bg-red-100 text-red-800"
                                    : ticket.priority === "MEDIUM"
                                      ? "bg-orange-50 text-orange-700"
                                      : "bg-gray-50 text-gray-600"
                              }`}
                            >
                              {ticket.priority || "MEDIUM"}
                            </span>
                            <span className="text-xs text-gray-500 font-mono">
                              #{ticket.ticket_id}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(ticket.created_at).toLocaleDateString(
                              "en-IN",
                              { day: "numeric", month: "short" },
                            )}
                          </div>
                        </div>
                        <div className="font-semibold text-gray-900 text-sm line-clamp-1">
                          {ticket.subject}
                        </div>
                        <div className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                          {ticket.description}
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="h-full flex items-center justify-center p-8 text-center">
                      <div>
                        <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center relative">
                          <Inbox className="text-gray-400" size={34} />
                          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-400 shadow-sm" />
                          <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-sm" />
                        </div>
                        <h3 className="text-base font-semibold text-gray-900">
                          You have no tickets
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 max-w-sm">
                          Your store tickets will appear here
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: empty state until user opens ticket */}
              <div className="hidden md:flex flex-1 min-w-0 min-h-0 items-center justify-center bg-white">
                <div className="text-center px-8 py-10">
                  <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-gray-100 flex items-center justify-center relative">
                    <Inbox className="text-gray-400" size={34} />
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-400 shadow-sm" />
                    <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-amber-300 shadow-sm" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900">
                    You have no tickets
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 max-w-sm">
                    Select a ticket from the left to view the conversation.
                  </p>
                </div>
              </div>
            </div>
          )
        ) : (
          /* User Insights View — 2-column layout like Reviews screen */
          <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Main 2-panel layout */}
            <div className="flex flex-1 min-h-0 overflow-hidden rounded-lg border border-gray-200 bg-white">
              {/* Left panel: list */}
              <div className="w-full md:w-[360px] shrink-0 border-b md:border-b-0 md:border-r border-gray-200 flex flex-col min-h-0">
                {/* Sticky header with shared bottom border (list scrolls under it) */}
                <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
                  <div className="p-3 flex items-center gap-2">
                    <MobileHamburgerButton />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search reviews"
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
                    />
                  </div>

                  <div className="px-3 pb-3 flex items-center justify-between gap-2">
                    <div className="flex gap-1">
                      <button
                        type="button"
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          filter === "all"
                            ? "bg-gray-900 text-white"
                            : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                        }`}
                        onClick={() => setFilter("all")}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          filter === "review"
                            ? "bg-green-600 text-white"
                            : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                        }`}
                        onClick={() => setFilter("review")}
                      >
                        Reviews
                      </button>
                      <button
                        type="button"
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          filter === "complaint"
                            ? "bg-amber-600 text-white"
                            : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                        }`}
                        onClick={() => setFilter("complaint")}
                      >
                        Complaints
                      </button>
                    </div>
                    <span className="text-[11px] text-gray-500">
                      {filteredReviews.length}/{reviews.length}
                    </span>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2 scrollbar-hide">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-3">
                        <div className="h-3 w-1/3 rounded bg-gray-200 mb-2" />
                        <div className="h-2.5 w-full rounded bg-gray-200 mb-1" />
                        <div className="h-2.5 w-2/3 rounded bg-gray-200" />
                      </div>
                    ))
                  ) : filteredReviews.length > 0 ? (
                    filteredReviews.map((review) => {
                      const active = expandedReview === review.id;
                      return (
                        <button
                          key={review.id}
                          type="button"
                          onClick={() => setExpandedReview(review.id)}
                          className={`w-full text-left rounded-lg border p-3 transition-all ${
                            active
                              ? "border-orange-400 bg-orange-50/40 ring-2 ring-orange-500/15"
                              : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="h-9 w-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-700 shrink-0">
                              {review.customerName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .substring(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {review.customerName}
                                </p>
                                <span className="text-[10px] text-gray-500 shrink-0">
                                  {formatDate(review.date)}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center gap-1 flex-wrap">
                                {getReviewTypeTag(review.type)}
                                {review.rating ? (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
                                    <Star size={10} className="fill-yellow-500 text-yellow-500" />
                                    {review.rating}
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-1 text-xs text-gray-600 line-clamp-2">
                                {review.message}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="h-full flex items-center justify-center p-8 text-center">
                      <div>
                        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
                          <MessageSquare className="text-gray-400" size={22} />
                        </div>
                        <p className="text-sm font-semibold text-gray-900">No feedback found</p>
                        <p className="mt-1 text-sm text-gray-500">There are no entries to display.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel: details */}
              <div className="hidden md:flex flex-1 min-w-0 min-h-0 flex-col bg-white">
                <div className="sticky top-0 z-10 bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-gray-900">Customer reviews</h2>
                  <div className="text-xs text-gray-500">
                    {expandedReview ? "Detailed view" : "No review selected"}
                  </div>
                </div>

                <div className="flex-1 min-h-0 flex flex-col bg-gray-50/40">
                  {expandedReview ? (
                    (() => {
                      const review = filteredReviews.find((r) => r.id === expandedReview) || null;
                      if (!review) {
                        return (
                          <div className="text-center text-sm text-gray-600">
                            Select a review from the left.
                          </div>
                        );
                      }
                      const storeTitle = (store?.store_name || "Store").trim();
                      const storeCity =
                        typeof (store as any)?.city === "string" ? String((store as any).city).trim() : "";
                      const storeHeading = storeCity ? `${storeTitle}, ${storeCity}` : storeTitle;
                      const orderLabel = (review.orderPublicId || "").trim() || (review.orderId ? String(review.orderId) : "");
                      const orderCountLabel =
                        typeof review.orderCount === "number" && review.orderCount > 0
                          ? `${review.orderCount} ${review.orderCount === 1 ? "order" : "orders"} with you`
                          : "—";
                      const orderSummaryLabel =
                        (typeof review.orderSummary === "string" && review.orderSummary.trim()) ||
                        null;
                      const responseValue = responseText[String(review.id)] || "";
                      const canSend =
                        (responseValue.trim().length > 0 ||
                          ((responseImages[String(review.id)]?.length ?? 0) > 0)) &&
                        !sendingResponse[String(review.id)];

                      return (
                        <div className="flex min-h-0 flex-1 flex-col">
                          {/* Top info (matches screenshot style) */}
                          <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <h3 className="text-base font-semibold text-gray-900 truncate">
                                  {storeHeading}
                                </h3>
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {formatDate(review.date)}
                                  {orderLabel ? ` • Order ID: ${orderLabel}` : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={!orderLabel}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                title={orderLabel ? "Order details" : "No order linked"}
                              >
                                <FileText size={16} className="text-gray-500" />
                                Order details
                              </button>
                            </div>
                          </div>

                          {/* Middle: scrollable message */}
                          <div className="flex-1 min-h-0 overflow-y-auto bg-white px-6 py-5">
                            <div className="flex items-start gap-3">
                              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700 shrink-0">
                                {review.customerName
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .substring(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                      {review.customerName}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                      {orderSummaryLabel ? orderSummaryLabel : orderCountLabel}
                                    </p>
                                  </div>
                                  <div className="shrink-0 flex items-center gap-2">
                                    {getReviewTypeTag(review.type)}
                                    {review.rating ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">
                                        <Star size={12} className="fill-orange-500 text-orange-500" />
                                        {review.rating}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="mt-4 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                                  {review.message}
                                </div>

                                {review.response ? (
                                  <div className="mt-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
                                    <p className="text-xs font-semibold text-orange-800 mb-2">
                                      Your response
                                    </p>
                                    {(() => {
                                      const { text, images } = parseResponseMedia(review.response);
                                      return (
                                        <>
                                          {text ? (
                                            <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                              {text}
                                            </p>
                                          ) : null}
                                          {images.length > 0 ? (
                                            <div className="mt-3 grid grid-cols-3 gap-2">
                                              {images.map((img, idx) => (
                                                <a key={idx} href={img} target="_blank" rel="noreferrer">
                                                  <img
                                                    src={img}
                                                    alt=""
                                                    className="h-24 w-full rounded-lg border border-orange-200 object-cover"
                                                  />
                                                </a>
                                              ))}
                                            </div>
                                          ) : null}
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          {/* Bottom: fixed reply */}
                          {!review.response ? (
                            <div className="flex-shrink-0 border-t border-gray-200 bg-white px-6 py-4">
                              <div className="relative w-full">
                                <textarea
                                  value={responseValue}
                                  onChange={(e) => handleResponseChange(String(review.id), e.target.value)}
                                  placeholder="Type your reply here"
                                  rows={1}
                                  className="w-full resize-none rounded-2xl border border-gray-200 bg-white px-4 py-3 pr-14 text-sm outline-none shadow-sm max-h-28 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/15"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSendResponse(String(review.id))}
                                  disabled={!canSend}
                                  className={`absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                                    canSend
                                      ? "bg-orange-600 text-white hover:bg-orange-700"
                                      : "bg-gray-100 text-gray-400 cursor-not-allowed"
                                  }`}
                                  aria-label="Send reply"
                                  title="Send"
                                >
                                  {sendingResponse[String(review.id)] ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                  ) : (
                                    <Send size={18} />
                                  )}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })()
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="w-full max-w-xl space-y-4 text-center">
                        {loading ? (
                          <div className="mx-auto grid w-[320px] gap-4">
                            <div className="h-20 rounded-xl border border-gray-200 bg-white shadow-sm animate-pulse" />
                            <div className="h-20 rounded-xl border border-gray-200 bg-white shadow-sm animate-pulse" />
                            <div className="h-20 rounded-xl border border-gray-200 bg-white shadow-sm animate-pulse" />
                          </div>
                        ) : (
                          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl border border-gray-200 bg-white shadow-sm">
                            <MessageSquare className="text-gray-400" size={28} />
                          </div>
                        )}
                        <p className="text-sm font-semibold text-gray-900">No review selected</p>
                        <p className="text-sm text-gray-500">Select a review from the left to view details.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </MXLayoutWhite>
  );
};

const UserInsightsPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      }
    >
      <UserInsightsContent />
    </Suspense>
  );
};

export default UserInsightsPage;
