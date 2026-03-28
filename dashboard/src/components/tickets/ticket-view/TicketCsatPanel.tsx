"use client";

import { useMemo } from "react";
import { Star, BarChart3, AlertCircle } from "lucide-react";

interface TicketRatingRow {
  ratingValue: number;
  feedbackText: string | null;
  ratedByType: string;
  createdAt: string;
}

interface RatingEntry {
  value: number;
  feedback: string | null;
  source: string;
  at: string | null;
}

function buildEntries(
  satisfactionRating: number | null | undefined,
  satisfactionFeedback: string | null | undefined,
  satisfactionCollectedAt: string | null | undefined,
  rows: TicketRatingRow[]
): RatingEntry[] {
  if (rows.length > 0) {
    return rows.map((r) => ({
      value: r.ratingValue,
      feedback: r.feedbackText,
      source: r.ratedByType,
      at: r.createdAt.trim() !== "" ? r.createdAt : null,
    }));
  }
  if (satisfactionRating != null && Number.isFinite(satisfactionRating)) {
    return [
      {
        value: satisfactionRating,
        feedback: satisfactionFeedback ?? null,
        source: "feedback",
        at: satisfactionCollectedAt && satisfactionCollectedAt.trim() !== "" ? satisfactionCollectedAt : null,
      },
    ];
  }
  return [];
}

function formatAbsolute(createdAt: string): string {
  const date = new Date(createdAt);
  return date.toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(createdAt: string): string {
  const date = new Date(createdAt);
  const diffMs = Date.now() - date.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "Just now";
  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function bucketLabel(value: number): { text: string; badge: "csat" | "dsat" | "neutral" } {
  if (value >= 4) return { text: "CSAT", badge: "csat" };
  if (value <= 2) return { text: "DSAT", badge: "dsat" };
  return { text: "Neutral", badge: "neutral" };
}

export function TicketCsatPanel({
  ticketId,
  ticketNumber,
  satisfactionRating = null,
  satisfactionFeedback = null,
  satisfactionCollectedAt = null,
  ticketRatings = [],
}: {
  ticketId: number;
  ticketNumber: string;
  satisfactionRating?: number | null;
  satisfactionFeedback?: string | null;
  satisfactionCollectedAt?: string | null;
  ticketRatings?: TicketRatingRow[];
}) {
  const entries = useMemo(
    () => buildEntries(satisfactionRating, satisfactionFeedback, satisfactionCollectedAt, ticketRatings),
    [satisfactionRating, satisfactionFeedback, satisfactionCollectedAt, ticketRatings]
  );

  const avg = entries.length > 0 ? entries.reduce((s, e) => s + e.value, 0) / entries.length : null;
  const csatN = entries.filter((e) => e.value >= 4).length;
  const dsatN = entries.filter((e) => e.value <= 2).length;

  return (
    <div className="mt-0 flex flex-col gap-4 px-0 xl:flex-row xl:items-stretch">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-amber-600">
                <Star className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{"C&D-SAT"}</h3>
                <p className="text-xs text-gray-600">
                  Ticket <span className="font-medium text-gray-800">#{ticketNumber || ticketId}</span>
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 sm:text-right">
              {entries.length} {entries.length === 1 ? "rating" : "ratings"}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-md border border-gray-200 bg-gray-50/80 px-2 py-2.5 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Avg</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-gray-900">
                {avg != null ? avg.toFixed(1) : "—"}
              </p>
              <p className="text-[10px] text-gray-500">out of 5</p>
            </div>
            <div className="rounded-md border border-green-200 bg-green-50/50 px-2 py-2.5 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-green-800">CSAT</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-green-900">{csatN}</p>
              <p className="text-[10px] text-green-800">4–5★</p>
            </div>
            <div className="rounded-md border border-red-200 bg-red-50/50 px-2 py-2.5 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wide text-red-800">DSAT</p>
              <p className="mt-0.5 text-base font-semibold tabular-nums text-red-900">{dsatN}</p>
              <p className="text-[10px] text-red-800">1–2★</p>
            </div>
          </div>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center">
            <p className="text-sm text-gray-600">No ratings yet</p>
            <p className="mt-1 text-xs text-gray-500">Ratings show here when a customer submits a score.</p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {entries.map((e, i) => {
              const { text: bucket, badge } = bucketLabel(e.value);
              const leftBar =
                badge === "csat" ? "border-l-green-500" : badge === "dsat" ? "border-l-red-500" : "border-l-gray-400";
              return (
                <li
                  key={`${e.at ?? ""}-${e.value}-${i}`}
                  className={`flex gap-3 rounded-lg border border-gray-200 bg-white px-3 py-3 ${leftBar} border-l-2`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${
                      badge === "csat"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : badge === "dsat"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-gray-200 bg-gray-50 text-gray-600"
                    }`}
                  >
                    <Star className="h-3.5 w-3.5" strokeWidth={2} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-[13px] font-medium leading-snug text-gray-900">
                        User Experience
                        <span className="font-normal text-gray-600">
                          {" "}
                          · {e.value}/5 · {bucket}
                        </span>
                      </span>
                      {badge === "csat" ? (
                        <span className="shrink-0 rounded border border-green-200 bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-800">
                          CSAT
                        </span>
                      ) : badge === "dsat" ? (
                        <span className="shrink-0 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-800">
                          DSAT
                        </span>
                      ) : (
                        <span className="shrink-0 rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                          Neutral
                        </span>
                      )}
                    </div>
                    {e.at && (
                      <div className="mt-1 text-[11px] text-gray-500">
                        <span className="font-medium text-gray-600 not-italic">{formatRelative(e.at)}</span>
                        <span className="text-gray-400"> · </span>
                        <span className="italic">{formatAbsolute(e.at)}</span>
                      </div>
                    )}
                    <ul className="mt-2.5 space-y-1 border-t border-gray-100 pt-2.5 text-[12px] leading-relaxed text-gray-700">
                      <li className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                        <span>
                          Score <span className="font-medium text-gray-900">{e.value}/5</span> ({bucket})
                        </span>
                      </li>
                      {e.source && e.source !== "feedback" && (
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                          <span className="text-[11px] uppercase tracking-wide text-gray-500">Source · {e.source}</span>
                        </li>
                      )}
                      {e.feedback && e.feedback.trim() !== "" ? (
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                          <span className="text-gray-800">&ldquo;{e.feedback}&rdquo;</span>
                        </li>
                      ) : (
                        <li className="flex items-start gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-300" />
                          <span className="text-gray-400">No written comment</span>
                        </li>
                      )}
                    </ul>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="w-full shrink-0 xl:sticky xl:top-2 xl:w-[17.5rem]">
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 bg-gray-900 text-[10px] font-semibold text-white">
              #
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">This ticket</p>
              <p className="text-sm font-semibold text-gray-900">{ticketNumber || ticketId}</p>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between rounded-md border border-gray-200 bg-gray-50/80 px-2.5 py-2 text-xs">
              <span className="text-gray-600">Average</span>
              <span className="font-semibold tabular-nums text-gray-900">{avg != null ? avg.toFixed(1) : "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-green-200 bg-green-50/50 px-2.5 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-green-800">
                <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                CSAT (4–5★)
              </span>
              <span className="font-semibold tabular-nums text-green-900">{csatN}</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50/50 px-2.5 py-2 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-red-800">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                DSAT (1–2★)
              </span>
              <span className="font-semibold tabular-nums text-red-900">{dsatN}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
