"use client";

import { Clock } from "lucide-react";

type DayRow = {
  day_label: string;
  open: boolean;
  slot1_start: string | null;
  slot1_end: string | null;
  slot2_start: string | null;
  slot2_end: string | null;
  total_duration_minutes: number;
};

function formatSlot(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  return `${start} - ${end}`;
}

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

const DAY_LABELS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
];

const ABBREV: Record<string, string> = {
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
  Sunday: "Sun",
};

export function OperatingDaysCard({
  operatingHours,
  loading,
}: {
  operatingHours: Record<string, unknown> | null;
  loading?: boolean;
}) {
  const days: DayRow[] = operatingHours
    ? DAY_LABELS.map((d) => ({
        day_label: d.label,
        open: Boolean(operatingHours[`${d.key}_open`]),
        slot1_start: (operatingHours[`${d.key}_slot1_start`] as string) ?? null,
        slot1_end: (operatingHours[`${d.key}_slot1_end`] as string) ?? null,
        slot2_start: (operatingHours[`${d.key}_slot2_start`] as string) ?? null,
        slot2_end: (operatingHours[`${d.key}_slot2_end`] as string) ?? null,
        total_duration_minutes: Number(operatingHours[`${d.key}_total_duration_minutes`]) || 0,
      }))
    : [];
  const totalMinutes = days.reduce((sum, d) => sum + (d.total_duration_minutes || 0), 0);

  return (
    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Clock size={16} className="text-blue-600" />
          Operating Days
        </h3>
        {totalMinutes > 0 && (
          <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
            Total: {minutesToHours(totalMinutes)}
          </span>
        )}
      </div>
      {loading ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mx-auto" />
          <p className="text-xs text-gray-500 mt-2">Loading...</p>
        </div>
      ) : days.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-xs text-gray-500">No operating hours configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-1.5">
          {days.map((day) => (
            <div
              key={day.day_label}
              className="flex items-center justify-between text-xs py-1 px-2 rounded border border-gray-100 bg-white"
            >
              <span className="font-medium w-16 text-gray-900">
                {ABBREV[day.day_label] || day.day_label}
              </span>
              {day.open ? (
                <span className="text-green-700 font-semibold">Open</span>
              ) : (
                <span className="text-red-500 font-semibold">Closed</span>
              )}
              <span className="text-gray-700 flex flex-col items-end min-w-[120px] text-right">
                {day.open && (
                  <>
                    {formatSlot(day.slot1_start, day.slot1_end) && (
                      <span className="text-xs leading-tight">
                        {formatSlot(day.slot1_start, day.slot1_end)}
                      </span>
                    )}
                    {formatSlot(day.slot2_start, day.slot2_end) && (
                      <span className="text-xs leading-tight mt-0.5">
                        {formatSlot(day.slot2_start, day.slot2_end)}
                      </span>
                    )}
                    {day.total_duration_minutes > 0 && (
                      <span className="text-xs text-gray-500 mt-0.5">
                        ({minutesToHours(day.total_duration_minutes)})
                      </span>
                    )}
                  </>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
