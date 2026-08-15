export function formatTimeHMS(t: string | null): string {
  if (!t) return "--";
  const parts = t.split(":");
  if (parts.length === 2) return `${t}:00`;
  if (parts.length === 1) return `${t.padStart(2, "0")}:00:00`;
  return t;
}

export function formatHmsCountdown(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export type StoreStatusBadge = {
  label: string;
  dot: string;
  pill: string;
};

export function computeStoreStatusBadge(input: {
  isStoreOpen: boolean;
  restrictionType: string | null;
  schedulePhase: string | null;
  isTodayScheduledClosed: boolean;
  countdownKind: string | null;
  scheduledTimeOffs: Array<{ phase: "active" | "upcoming" }>;
  isDelisted?: boolean;
}): StoreStatusBadge {
  const {
    isStoreOpen,
    restrictionType,
    schedulePhase,
    isTodayScheduledClosed,
    countdownKind,
    scheduledTimeOffs,
    isDelisted,
  } = input;

  if (isDelisted) {
    return {
      label: "Delisted",
      dot: "bg-red-600",
      pill: "bg-red-500/10 text-red-900 ring-1 ring-red-500/30",
    };
  }

  if (scheduledTimeOffs.some((x) => x.phase === "active")) {
    return {
      label: "Sheduled-off Active",
      dot: "bg-rose-600",
      pill: "bg-rose-500/10 text-rose-950 ring-1 ring-rose-500/25",
    };
  }
  if (isTodayScheduledClosed || schedulePhase === "OFF_DAY") {
    return {
      label: "Scheduled Off",
      dot: "bg-slate-500",
      pill: "bg-slate-500/10 text-slate-800 ring-1 ring-slate-500/20",
    };
  }
  if (restrictionType === "MANUAL_HOLD") {
    return {
      label: "Waiting manual activation",
      dot: "bg-amber-500",
      pill: "bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/25",
    };
  }
  if (schedulePhase === "BREAK" || (!isStoreOpen && countdownKind === "reopens_in")) {
    return {
      label: "Break Time",
      dot: "bg-amber-500",
      pill: "bg-amber-500/10 text-amber-900 ring-1 ring-amber-500/25",
    };
  }
  if (schedulePhase === "PRE_BREAK" || countdownKind === "break_starts_in") {
    return {
      label: "Open",
      dot: "bg-emerald-500 animate-pulse",
      pill: "bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/20",
    };
  }
  if (isStoreOpen) {
    const hasUpcoming = scheduledTimeOffs.some((x) => x.phase === "upcoming");
    return {
      label: "Open",
      dot: "bg-emerald-500 animate-pulse",
      pill: hasUpcoming
        ? "bg-emerald-500/10 text-emerald-900 ring-1 ring-amber-400/50"
        : "bg-emerald-500/10 text-emerald-800 ring-1 ring-emerald-500/20",
    };
  }
  return {
    label: "Closed",
    dot: "bg-red-500",
    pill: "bg-red-500/10 text-red-800 ring-1 ring-red-500/20",
  };
}
