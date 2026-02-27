"use client";

import { useEffect, useState } from "react";

interface TimelineOrder {
  status: string;
}

const timelineStages = [
  { stage: "Created", time: new Date("2025-12-19T08:12:00"), duration: 0 },
  { stage: "Bill Ready", time: new Date("2025-12-19T08:12:00"), duration: 0 },
  { stage: "Paymentinitiated At", time: new Date("2025-12-19T08:25:00"), duration: 0 },
  { stage: "Payment Done", time: new Date("2025-12-19T08:25:00"), duration: 0 },
  { stage: "Pymt Assign RX", time: new Date("2025-12-19T08:25:00"), duration: 0 },
  { stage: "Accepted", time: new Date("2025-12-19T08:43:00"), duration: 17 },
  { stage: "Dispatch Ready", time: new Date("2025-12-19T09:02:00"), duration: 20 },
  { stage: "Dispatched", time: new Date("2025-12-19T09:02:00"), duration: 20 },
  { stage: "Delivered", time: new Date("2025-12-19T09:19:00"), duration: 25 },
  { stage: "Cancelled", time: new Date("2025-12-19T09:25:00"), duration: 0 },
];

export default function OrderTimeline({ order }: { order: TimelineOrder }) {
  const [breachedStageIndex, setBreachedStageIndex] = useState<number>(-1);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);

  useEffect(() => {
    const orderStatus = order?.status?.toLowerCase() || "";
    if (orderStatus === "cancelled" || orderStatus === "rejected") {
      setIsCancelled(true);
    }

    const dispatchedIndex = timelineStages.findIndex((s) => s.stage === "Dispatched");
    if (dispatchedIndex !== -1) {
      setBreachedStageIndex(dispatchedIndex);
    }
  }, [order?.status]);

  const formatTimeShort = (date: Date) => {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
  };

  const getStageColor = (index: number, stage: string) => {
    if (stage === "Cancelled") {
      return { dot: "bg-blue-500", text: "text-blue-600" };
    }
    if (stage === "Delivered" && isCancelled) {
      return { dot: "bg-blue-500", text: "text-blue-600" };
    }
    if (breachedStageIndex !== -1 && index >= breachedStageIndex && stage !== "Cancelled") {
      return { dot: "bg-red-500", text: "text-red-600" };
    }
    return { dot: "bg-emerald-500", text: "text-emerald-600" };
  };

  return (
    <div className="bg-white/95 rounded-lg pl-0 pr-3 py-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-200 relative">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5 text-[11px] sm:text-[12px] text-slate-700">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <i className="bi bi-graph-up text-xs" />
          </span>
          <span className="font-medium truncate">
            Order progress timeline · Delivery, GatiMitra
          </span>
        </div>
        {breachedStageIndex !== -1 && (
          <div className="shrink-0 -mt-0.5">
            <div className="px-3 py-1 rounded-full text-[11px] font-medium text-white whitespace-nowrap bg-red-500 shadow-md">
              ETA breached at {timelineStages[breachedStageIndex].stage}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-10 mb-1.5 pr-1">
        {timelineStages.map((stage) => (
          <div
            key={stage.stage}
            className="px-1 text-[9px] sm:text-[10px] font-normal text-center whitespace-normal break-words leading-tight text-slate-600"
          >
            {stage.stage}
          </div>
        ))}
      </div>

      <div className="relative mt-1 overflow-x-auto pb-1 sm:overflow-visible">
        <div className="relative h-18 min-w-[640px] sm:min-w-0">
          <div className="absolute top-[10px] left-1 right-3 sm:left-0 sm:right-0">
            <div className="grid grid-cols-10 relative">
              {timelineStages.slice(0, 9).map((_, index) => {
                if (index < 9) {
                  return (
                    <div
                      key={`line-${index}`}
                      className="absolute top-1/2 h-[3px] transform -translate-y-1/2 z-0"
                      style={{
                        left: `${(index * 100) / 10 + 100 / 20}%`,
                        width: `${100 / 10}%`,
                        background: "#10B981",
                      }}
                    />
                  );
                }
                return null;
              })}

              {timelineStages.map((stage, index) => {
                const colors = getStageColor(index, stage.stage);

                return (
                  <div
                    key={`dot-${stage.stage}`}
                    className="relative flex flex-col items-center"
                    style={{
                      gridColumn: index + 1,
                    }}
                  >
                    <div className="absolute top-[12px] left-1/2 transform -translate-x-1/2 h-4 w-[2px] bg-slate-200" />

                    <div
                      className={`w-4 h-4 rounded-full flex items-center justify-center z-10 border border-white ${colors.dot} relative`}
                    >
                      <div className="absolute w-4 h-4 rounded-full border border-white/70" />
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>

                    <div
                      className={`absolute top-[34px] text-[9px] sm:text-[10px] font-normal leading-tight whitespace-nowrap ${colors.text} text-slate-500`}
                    >
                      {formatTimeShort(stage.time)}
                    </div>

                    {stage.duration > 0 && (
                      <div className="absolute top-[48px] text-[9px] sm:text-[10px] font-normal px-1 py-0.5 rounded text-emerald-700 bg-emerald-50">
                        {stage.duration}m
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

