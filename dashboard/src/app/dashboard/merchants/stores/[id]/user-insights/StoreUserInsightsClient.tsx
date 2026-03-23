"use client";

import React, { useState, useEffect } from "react";
import {
  Star,
  MessageSquare,
  AlertTriangle,
  Filter,
  Calendar,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";

type Review = {
  id: number;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  customerMobile: string | null;
  orderId: number | null;
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
};

type Stats = {
  total: number;
  reviews: number;
  complaints: number;
  repeatedUsers: number;
  newUsers: number;
  fraudUsers: number;
};

const defaultStats: Stats = {
  total: 0,
  reviews: 0,
  complaints: 0,
  repeatedUsers: 0,
  newUsers: 0,
  fraudUsers: 0,
};

function parseResponseText(response: string): { text: string; images: string[] } {
  if (!response || typeof response !== "string") return { text: response || "", images: [] };
  const match = response.match(/\[IMAGES:([\s\S]*?)\]\s*$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      const images = Array.isArray(parsed) ? parsed : [];
      const text = response.replace(/\n?\n?\[IMAGES:[\s\S]*?\]\s*$/, "").trim();
      return { text, images };
    } catch {
      const text = response.replace(/\n?\n?\[IMAGES:[\s\S]*?\]\s*$/, "").trim();
      return { text, images: [] };
    }
  }
  return { text: response.trim(), images: [] };
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

export function StoreUserInsightsClient({ storeId }: { storeId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<"all" | "review" | "complaint">("all");
  const [stats, setStats] = useState<Stats>(defaultStats);
  const [storeName, setStoreName] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    const fetchReviews = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}/reviews`);
        const data = await res.json();
        if (data.success) {
          setReviews(data.reviews || []);
          setStats(data.stats || defaultStats);
        } else {
          toast("Failed to load feedback");
        }
      } catch (e) {
        console.error("Error fetching reviews:", e);
        toast("Failed to load feedback");      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, [storeId, toast]);

  useEffect(() => {
    if (!storeId) return;
    const fetchStore = async () => {
      try {
        const res = await fetch(`/api/merchant/stores/${storeId}`);
        const data = await res.json();
        if (data.success && data.store) {
          setStoreName(data.store.store_display_name || data.store.store_name || data.store.name || null);
        }
      } catch {
        // ignore
      }
    };
    fetchStore();
  }, [storeId]);

  const filteredReviews =
    filter === "all"
      ? reviews
      : filter === "review"
        ? reviews.filter((r) => r.type === "Review")
        : reviews.filter((r) => r.type === "Complaint");

  const getUserTypeTag = (userType: string, fraudFlag = "") => {
    const config: Record<string, { icon: React.ReactNode; text: string; bg: string; textColor: string; border: string }> = {
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
    const tag = config[userType] ?? config.new;
    return (
      <span
        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${tag.bg} ${tag.textColor} ${tag.border} border`}
      >
        {tag.icon}
        {tag.text}
      </span>
    );
  };

  const getReviewTypeTag = (type: string) =>
    type === "Review" ? (
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

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="mb-3 sm:mb-4 flex-shrink-0 bg-white border-b border-gray-200 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0 text-left">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900">User Insights</h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-0.5">
              View customer feedback (reviews and complaints). Read-only.
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2 mb-3 sm:mb-4 flex-shrink-0">
        <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Total</div>
          <div className="text-base sm:text-lg lg:text-xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5 flex items-center gap-0.5">
            <Star size={9} className="sm:w-2.5 sm:h-2.5" />
            <span className="hidden sm:inline">Reviews</span>
            <span className="sm:hidden">Rev</span>
          </div>
          <div className="text-base sm:text-lg lg:text-xl font-bold text-green-600">{stats.reviews}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5 flex items-center gap-0.5">
            <AlertTriangle size={9} className="sm:w-2.5 sm:h-2.5" />
            <span className="hidden sm:inline">Complaints</span>
            <span className="sm:hidden">Comp</span>
          </div>
          <div className="text-base sm:text-lg lg:text-xl font-bold text-amber-600">{stats.complaints}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Repeated</div>
          <div className="text-base sm:text-lg lg:text-xl font-bold text-blue-600">{stats.repeatedUsers}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">New</div>
          <div className="text-base sm:text-lg lg:text-xl font-bold text-green-600">{stats.newUsers}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2 sm:p-2.5 shadow-sm hover:shadow-md transition-shadow">
          <div className="text-[9px] sm:text-[10px] text-gray-500 mb-0.5">Fraud</div>
          <div className="text-base sm:text-lg lg:text-xl font-bold text-red-600">{stats.fraudUsers}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4 flex-shrink-0">
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          <button
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium text-[10px] sm:text-xs transition-all ${
              filter === "all"
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
            onClick={() => setFilter("all")}
          >
            All
          </button>
          <button
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1 transition-all ${
              filter === "review"
                ? "bg-green-600 text-white shadow-sm"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
            onClick={() => setFilter("review")}
          >
            <Star size={10} className="sm:w-3 sm:h-3" />
            Reviews
          </button>
          <button
            className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg font-medium text-[10px] sm:text-xs flex items-center gap-0.5 sm:gap-1 transition-all ${
              filter === "complaint"
                ? "bg-amber-600 text-white shadow-sm"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
            onClick={() => setFilter("complaint")}
          >
            <AlertTriangle size={10} className="sm:w-3 sm:h-3" />
            Complaints
          </button>
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 text-[9px] sm:text-[10px] text-gray-600">
          <Filter size={10} className="sm:w-3 sm:h-3" />
          <span>
            Showing {filteredReviews.length} of {reviews.length}
          </span>
        </div>
      </div>

      {/* List - read only */}
      <div className="space-y-3 sm:space-y-4 overflow-y-auto flex-1 min-h-0 pb-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-200 rounded w-full mb-1" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          ))
        ) : filteredReviews.length > 0 ? (
          filteredReviews.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 lg:p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-4">
                <div className="flex items-start sm:items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-gray-700 font-bold text-xs sm:text-sm lg:text-base flex-shrink-0">
                    {review.customerName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .substring(0, 2)
                      .toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-gray-900 text-xs sm:text-sm lg:text-base truncate">
                        {review.customerName}
                      </h3>
                      <span className="text-[10px] sm:text-xs text-gray-500 flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                        <Calendar size={9} className="sm:w-2.5 sm:h-2.5" />
                        {formatDate(review.date)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                      {getReviewTypeTag(review.type)}
                      {getUserTypeTag(review.userType, review.flagReason || "")}
                      {review.orderCount > 0 && (
                        <span className="text-[10px] sm:text-xs text-gray-500 bg-gray-50 px-1.5 sm:px-2 py-0.5 rounded border border-gray-100">
                          {review.orderCount} {review.orderCount === 1 ? "order" : "orders"}
                        </span>
                      )}
                      {review.rating > 0 && (
                        <div className="flex items-center gap-0.5">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              size={10}
                              className={`sm:w-3 sm:h-3 ${
                                i < review.rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-[10px] sm:text-xs text-gray-500 font-mono">
                    #{review.id.toString().padStart(4, "0")}
                  </div>
                </div>
              </div>

              {/* Customer message */}
              <div className="mb-3 sm:mb-4">
                <div className="bg-gray-50 rounded-lg p-2.5 sm:p-3 lg:p-4 border-l-4 border-gray-300">
                  <p className="text-xs sm:text-sm lg:text-base text-gray-800 leading-relaxed">
                    {review.message}
                  </p>
                  {review.reviewImages && review.reviewImages.length > 0 && (
                    <div className="mt-2 sm:mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2">
                      {review.reviewImages.map((img, idx) => (
                        <img
                          key={idx}
                          src={img}
                          alt={`Review ${idx + 1}`}
                          className="w-full h-20 sm:h-24 lg:h-32 object-cover rounded-lg border border-gray-200"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Store response - read only */}
              {review.response ? (
                <div className="flex items-start gap-2 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 lg:w-9 lg:h-9 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] sm:text-xs flex-shrink-0">
                    {(storeName || "S").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
                      <span className="font-semibold text-gray-900 text-xs sm:text-sm">
                        {storeName || "Store"}
                      </span>
                      <span className="text-[10px] sm:text-xs text-gray-500">
                        {review.respondedAt &&
                          `${formatDate(review.respondedAt)} • ${formatTime(review.respondedAt)}`}
                      </span>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg rounded-tl-none p-2.5 sm:p-3 lg:p-4 shadow-sm">
                      {(() => {
                        const { text, images } = parseResponseText(review.response);
                        return (
                          <>
                            {text && (
                              <p className="text-xs sm:text-sm lg:text-base text-gray-800 whitespace-pre-wrap leading-relaxed mb-2">
                                {text}
                              </p>
                            )}
                            {images.length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-2 mt-2 sm:mt-3">
                                {images.map((img, idx) => (
                                  <img
                                    key={idx}
                                    src={img}
                                    alt={`Response ${idx + 1}`}
                                    className="w-full h-20 sm:h-24 lg:h-32 object-cover rounded-lg border-2 border-orange-300"
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 p-8 sm:p-12 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <MessageSquare className="text-gray-400" size={24} />
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-1 sm:mb-2">
              No feedback found
            </h3>
            <p className="text-sm sm:text-base text-gray-500">
              There are no {filter === "all" ? "" : filter} entries to display.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
