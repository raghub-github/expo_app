"use client";

import { useMemo } from "react";

interface RiderTimelineProps {
  createdAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  status?: string | null;
  distanceKm?: number | null;
}

const riderStages = [
  "Assigned",
  "Reached Mx",
  "Picked Up",
  "Delivered",
] as const;

export default function RiderTimeline({
  createdAt,
  pickedUpAt,
  deliveredAt,
  status,
  distanceKm,
}: RiderTimelineProps) {
  const baseDate = createdAt ? new Date(createdAt) : new Date();

  const stages = useMemo(() => {
    const times: (Date | null)[] = [
      baseDate,
      pickedUpAt ? new Date(pickedUpAt) : null,
      pickedUpAt ? new Date(pickedUpAt) : null,
      deliveredAt ? new Date(deliveredAt) : null,
    ];

    return riderStages.map((stage, idx) => ({
      stage,
      time: times[idx] ?? baseDate,
      duration: 0,
    }));
  }, [baseDate, pickedUpAt, deliveredAt]);

  const statusString = (status || "").toLowerCase();
  const statusRank: Record<string, number> = {
    assigned: 0,
    accepted: 0,
    reached_store: 1,
    picked_up: 2,
    in_transit: 2,
    delivered: 3,
    cancelled: 3,
    failed: 3,
  };
  const currentIndex =
    statusRank[statusString] !== undefined ? statusRank[statusString] : 0;

  const formatTimeShort = (date: Date) => {
    if (!date || isNaN(date.getTime())) return "—";
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const distanceLabel =
    distanceKm != null && Number.isFinite(distanceKm)
      ? `${Number(distanceKm).toFixed(2)}km`
      : "—";

  return (
    <div className="bg-white/95 rounded-lg pl-0 pr-2.5 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.06)] border border-slate-200 relative">
      <div className="grid grid-cols-4 mb-1 pr-1">
        {stages.map((stage) => (
          <div
            key={stage.stage}
            className="px-1 text-[8px] sm:text-[9px] font-medium text-center whitespace-normal break-words leading-tight text-slate-600"
          >
            {stage.stage}
          </div>
        ))}
      </div>

      <div className="relative mt-0.5 overflow-x-auto pb-1 sm:overflow-visible">
        <div className="relative h-20 min-w-[360px] sm:min-w-0">
          <div className="absolute top-[8px] left-1 right-3 sm:left-0 sm:right-0">
            <div className="grid grid-cols-4 relative">
              {stages.slice(0, stages.length - 1).map((_, index) => (
                <div
                  key={`line-${index}`}
                  className="absolute top-1/2 h-[3px] transform -translate-y-1/2 z-0"
                  style={{
                    left: `${(index * 100) / stages.length + 100 / (stages.length * 2)}%`,
                    width: `${100 / stages.length}%`,
                    background:
                      index < currentIndex ? "#10B981" : "rgba(148,163,184,0.7)",
                  }}
                />
              ))}

              {stages.map((stage, index) => {
                const isCompleted = index <= currentIndex;
                const dotColor = isCompleted ? "bg-emerald-500" : "bg-slate-300";
                const textColor = isCompleted
                  ? "text-emerald-600"
                  : "text-slate-500";

                const time =
                  index === 0
                    ? formatTimeShort(stage.time)
                    : formatTimeShort(stage.time);

                return (
                  <div
                    key={`dot-${stage.stage}`}
                    className="relative flex flex-col items-center"
                    style={{
                      gridColumn: index + 1,
                    }}
                  >
                    <div className="absolute top-[10px] left-1/2 transform -translate-x-1/2 h-4 w-[2px] bg-slate-200" />

                    <div
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center z-10 border border-white ${dotColor} relative`}
                    >
                      <div className="absolute w-4 h-4 rounded-full border border-white/70" />
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    </div>

                    <div
                      className={`absolute top-[30px] text-[9px] sm:text-[10px] font-normal leading-tight whitespace-nowrap ${textColor}`}
                    >
                      {isCompleted ? time : ""}
                    </div>

                    <div className="absolute top-[46px] text-[8px] sm:text-[9px] font-normal px-1 py-0.5 rounded text-emerald-700 bg-emerald-50">
                      <span className="block">MX – {distanceLabel}</span>
                      <span className="block">CX – {distanceLabel}</span>
                    </div>
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

