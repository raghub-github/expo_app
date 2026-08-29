"use client";
import React, { useState, useEffect, Suspense, useRef, useMemo } from "react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import {
  Star,
  MessageSquare,
  AlertTriangle,
  Send,
  FileText,
  UserCheck,
  UserPlus,
  UserX,
  Calendar,
  Image as ImageIcon,
  Loader2,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { SkeletonReviewRow } from "@/components/merchant/SkeletonReviewRow";
import { UserInsightsOrderDetailsSidesheet } from "@/components/merchant/UserInsightsOrderDetailsSidesheet";

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
  replies?: Array<{ text: string; at: string; images?: string[] }>;
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

/** e.g. 18 Apr to 25 Apr */
function formatRangeSummary(fromYmd: string, toYmd: string) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  const o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return `${a.toLocaleDateString("en-IN", o)} to ${b.toLocaleDateString("en-IN", o)}`;
}

function customerInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

type UserInsightsStoreInfo = {
  store_name?: string | null;
  store_display_name?: string | null;
  name?: string | null;
  store_id?: string | null;
  city?: string | null;
};

function resolveStoreTitle(store: UserInsightsStoreInfo | null): string {
  if (!store) return "Store";
  const title = (
    store.store_display_name ||
    store.store_name ||
    store.name ||
    "Store"
  )
    .toString()
    .trim();
  return title || "Store";
}

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

function UserInsightsContent({ storeId }: { storeId: string }) {
  const searchParams = useAppSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [responseText, setResponseText] = useState<Record<string, string>>({});
  const [responseImages, setResponseImages] = useState<
    Record<string, ImagePreview[]>
  >({});
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
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

  const [store, setStore] = useState<UserInsightsStoreInfo | null>(null);
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
  const [orderSheetOpen, setOrderSheetOpen] = useState(false);
  const [orderSheetCoreId, setOrderSheetCoreId] = useState<number | null>(null);
  const [orderSheetPublicId, setOrderSheetPublicId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (searchParams?.get("view") === "inbox") {
      router.replace(`/dashboard/merchants/stores/${storeId}/user-insights`);
    }
  }, [searchParams, storeId, router]);

  useEffect(() => {
    if (!storeId) return;

    const loadStore = async () => {
      try {
        const res = await fetch(
          `/api/merchant/stores/${storeId}?verification=1`,
        );
        const data = await res.json();
        if (data.success && data.store) {
          const s = data.store as UserInsightsStoreInfo;
          setStore({
            store_name: s.store_name ?? null,
            store_display_name: s.store_display_name ?? null,
            name: s.name ?? null,
            store_id: s.store_id ?? null,
            city: s.city ?? null,
          });
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
        const qs = new URLSearchParams({
          from: dateFrom,
          to: dateTo,
        });
        const res = await fetch(
          `/api/merchant/stores/${storeId}/reviews?${qs.toString()}`,
        );
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
  }, [storeId, dateFrom, dateTo]);

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
      const res = await fetch(`/api/merchant/stores/${storeId}/reviews/respond`, {
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
                  replies: [
                    ...(Array.isArray(r.replies) ? r.replies : []),
                    {
                      text: message || "",
                      at: new Date().toISOString(),
                      ...(uploadedImageUrls.length > 0 ? { images: uploadedImageUrls } : {}),
                    },
                  ],
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

  const partnerShellTitle = "User Insights";

  const partnerShellSubtitle =
    "Monitor customer feedback and respond to reviews";

  const headerDateFilter = (
    <div className="inline-flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 text-[11px] text-gray-700">
      <Calendar size={13} className="shrink-0 text-gray-500" aria-hidden />
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
        className="max-w-[6.5rem] shrink-0 bg-transparent font-medium text-gray-800 outline-none"
        aria-label="Date range preset"
      >
        <option value="7d">Last 7 days</option>
        <option value="15d">Last 15 days</option>
        <option value="1m">Last 1 month</option>
        <option value="3m">Last 3 months</option>
        <option value="365d">Last 365 days</option>
        <option value="custom">Custom</option>
      </select>
      <span className="text-gray-300" aria-hidden>
        |
      </span>
      <button
        type="button"
        onClick={openCustomDatePicker}
        className="max-w-[7rem] truncate whitespace-nowrap text-gray-600 hover:text-gray-900 sm:max-w-none"
        title="Pick custom date range"
      >
        {formatRangeSummary(dateFrom, dateTo)}
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2 sm:flex-nowrap sm:px-4">
          <div className="min-w-0 flex-1 sm:max-w-[min(100%,28rem)]">
            <h1 className="text-sm font-semibold leading-tight text-gray-900">
              {partnerShellTitle}
            </h1>
            <p className="text-[11px] leading-tight text-gray-500 line-clamp-1">
              {partnerShellSubtitle}
            </p>
          </div>
          <div className="flex w-full min-w-0 shrink-0 items-center justify-end gap-2 sm:w-auto">
            {headerDateFilter}
          </div>
        </div>
      </header>
      {datePopoverOpen ? (
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
      ) : null}
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden p-3 md:gap-3">
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            {/* Main 2-panel layout — partnersite INBOX_PANEL style */}
            <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              {/* Left panel: list */}
              <div className="flex w-full min-h-0 shrink-0 flex-col border-b border-gray-200 bg-white md:w-[360px] md:border-b-0 md:border-r">
                <div className="sticky top-0 z-10 border-b border-gray-200 bg-white">
                  <div className="p-3 flex items-center gap-2">
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
                              {customerInitials(review.customerName)}
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
                      const storeTitle = resolveStoreTitle(store);
                      const storeCity =
                        typeof store?.city === "string" ? store.city.trim() : "";
                      const storeHeading = storeCity
                        ? `${storeTitle}, ${storeCity}`
                        : storeTitle;
                      const storePublicId = (store?.store_id || "").trim();
                      const orderLabel = (review.orderPublicId || "").trim();
                      const metaParts = [
                        formatDate(review.date),
                        storePublicId ? `Store ID: ${storePublicId}` : null,
                        orderLabel ? `Order ID: ${orderLabel}` : null,
                      ].filter(Boolean);
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
                                  {metaParts.join(" • ")}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={!review.orderId && !orderLabel}
                                onClick={() => {
                                  if (!review.orderId && !orderLabel) return;
                                  setOrderSheetCoreId(review.orderId);
                                  setOrderSheetPublicId(orderLabel || null);
                                  setOrderSheetOpen(true);
                                }}
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
                                {customerInitials(review.customerName)}
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

                                {(() => {
                                  const replyItems =
                                    Array.isArray(review.replies) && review.replies.length > 0
                                      ? review.replies
                                      : review.response &&
                                          !/support ticket\s+tkt-/i.test(review.response) &&
                                          !/\bTKT-\d{4}-\d+/i.test(review.response)
                                        ? [{ text: review.response, at: review.respondedAt ?? review.date }]
                                        : [];
                                  if (replyItems.length === 0) return null;
                                  return (
                                    <div className="mt-6 space-y-3">
                                      {replyItems.map((reply, ridx) => {
                                        const parsed = parseResponseMedia(reply.text || "");
                                        const images = [
                                          ...(Array.isArray(reply.images) ? reply.images : []),
                                          ...parsed.images,
                                        ].filter(Boolean);
                                        const text = parsed.text || (!images.length ? reply.text : "");
                                        return (
                                          <div
                                            key={`${reply.at ?? ridx}-${ridx}`}
                                            className="rounded-xl border border-orange-200 bg-orange-50 p-4"
                                          >
                                            <p className="text-xs font-semibold text-orange-800 mb-2">
                                              Your response
                                            </p>
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
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>

                          {/* Bottom: fixed reply */}
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

      </div>

      <UserInsightsOrderDetailsSidesheet
        open={orderSheetOpen}
        onClose={() => setOrderSheetOpen(false)}
        storeId={storeId}
        ordersCoreId={orderSheetCoreId}
        formattedOrderId={orderSheetPublicId}
      />
    </div>
  );
};

export function StoreUserInsightsClient({ storeId }: { storeId: string }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600" />
        </div>
      }
    >
      <UserInsightsContent storeId={storeId} />
    </Suspense>
  );
}
