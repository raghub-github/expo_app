"use client";

import { X } from "lucide-react";

export type RouteManeuverKind =
  | "depart"
  | "arrive"
  | "turn-right"
  | "turn-left"
  | "straight"
  | "uturn"
  | "roundabout"
  | "unknown";

export type RouteSheetStep = {
  instruction: string;
  distance: string;
  maneuver: RouteManeuverKind;
};

export type RouteSheetData = {
  title: string;
  summaryDistance: string;
  summaryDuration: string;
  steps: RouteSheetStep[];
};

function mapManeuverKind(
  maneuver: Record<string, unknown>,
  index: number,
  total: number
): RouteManeuverKind {
  const type = String(maneuver.type ?? "").toLowerCase();
  const modifier = String(maneuver.modifier ?? "").toLowerCase();

  if (type === "arrive" || index === total - 1) return "arrive";
  if (type === "depart" || index === 0) return "depart";
  if (modifier.includes("uturn") || type.includes("uturn")) return "uturn";
  if (modifier.includes("right")) return "turn-right";
  if (modifier.includes("left")) return "turn-left";
  if (type === "roundabout" || type === "rotary") return "roundabout";
  if (
    type === "continue" ||
    type === "new name" ||
    type === "merge" ||
    type === "on ramp" ||
    type === "off ramp" ||
    modifier.includes("straight") ||
    !modifier
  ) {
    return "straight";
  }
  return "unknown";
}

export function parseMapboxRouteSheet(
  json: Record<string, unknown>,
  selectedRouteIndex = 0
): RouteSheetData | null {
  const routes = json.routes as Record<string, unknown>[] | undefined;
  const route = routes?.[selectedRouteIndex] ?? routes?.[0];
  if (!route) return null;

  const leg = (route.legs as Record<string, unknown>[] | undefined)?.[0];
  const stepsRaw = (leg?.steps as Record<string, unknown>[] | undefined) ?? [];
  if (!stepsRaw.length) return null;

  const formatMeters = (m: number): string => {
    if (!Number.isFinite(m) || m <= 0) return "—";
    if (m < 1000) return `${Math.round(m)} m`;
    return `${(m / 1000).toFixed(1)} km`;
  };

  const formatSeconds = (sec: number): string => {
    if (!Number.isFinite(sec) || sec <= 0) return "—";
    if (sec < 60) return `${Math.round(sec)} s`;
    const min = Math.floor(sec / 60);
    const rem = Math.round(sec % 60);
    return rem > 0 ? `${min} min ${rem} s` : `${min} min`;
  };

  const streetNames = [
    ...new Set(
      stepsRaw
        .map((step) => String((step.name as string | undefined) ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const title =
    streetNames.length >= 2
      ? `${streetNames[0]}, ${streetNames[streetNames.length - 1]}`
      : streetNames[0] || "Route directions";

  const steps: RouteSheetStep[] = stepsRaw.map((step, index) => {
    const maneuver = (step.maneuver as Record<string, unknown> | undefined) ?? {};
    const instruction = String(maneuver.instruction ?? "Continue").trim();
    return {
      instruction,
      distance: formatMeters(Number(step.distance ?? 0)),
      maneuver: mapManeuverKind(maneuver, index, stepsRaw.length),
    };
  });

  return {
    title,
    summaryDistance: formatMeters(Number(route.distance ?? 0)),
    summaryDuration: formatSeconds(Number(route.duration ?? 0)),
    steps,
  };
}

function ManeuverIcon({ kind }: { kind: RouteManeuverKind }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "#1a1a1a",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "depart":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="9" fill="#fff" stroke="#1a1a1a" strokeWidth="1.5" />
          <text
            x="12"
            y="16"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#1a1a1a"
            stroke="none"
          >
            A
          </text>
        </svg>
      );
    case "arrive":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="10" r="3" fill="#1a1a1a" stroke="none" />
          <path d="M12 13v7" />
        </svg>
      );
    case "turn-right":
      return (
        <svg {...common} aria-hidden>
          <path d="M9 6v12M9 12h5a3 3 0 0 0 3-3V6" />
        </svg>
      );
    case "turn-left":
      return (
        <svg {...common} aria-hidden>
          <path d="M15 6v12M15 12H10a3 3 0 0 1-3-3V6" />
        </svg>
      );
    case "uturn":
      return (
        <svg {...common} aria-hidden>
          <path d="M8 8a4 4 0 0 1 8 0v4M16 12v4a4 4 0 0 1-8 0" />
        </svg>
      );
    case "roundabout":
      return (
        <svg {...common} aria-hidden>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 5v3M15 12h-3" />
        </svg>
      );
    case "straight":
    default:
      return (
        <svg {...common} aria-hidden>
          <path d="M12 5v14M8 9l4-4 4 4" />
        </svg>
      );
  }
}

interface RouteDirectionsSheetProps {
  data: RouteSheetData;
  onClose: () => void;
  className?: string;
}

export default function RouteDirectionsSheet({
  data,
  onClose,
  className = "",
}: RouteDirectionsSheetProps) {
  return (
    <div
      className={`gm-route-sheet absolute top-2 right-2 bottom-2 z-20 flex w-[min(100%,268px)] flex-col overflow-hidden rounded-sm border border-[#d4d4d4] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.18)] ${className}`}
      role="dialog"
      aria-label="Route directions"
    >
      <div className="relative shrink-0 border-b border-[#e8e8e8] px-3 pb-2.5 pt-2.5 pr-9">
        <p className="text-[13px] font-bold leading-snug text-[#1a1a1a]">{data.title}</p>
        <p className="mt-1 text-[12px] font-normal text-[#4a4a4a]">
          {data.summaryDistance}, {data.summaryDuration}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded text-[#888] hover:bg-[#f0f0f0] hover:text-[#333]"
          aria-label="Close route directions"
        >
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <ol className="gm-route-sheet__list flex-1 overflow-y-auto py-1">
        {data.steps.map((step, index) => (
          <li
            key={`${index}-${step.instruction.slice(0, 24)}`}
            className="gm-route-sheet__row flex items-start gap-2.5 px-3 py-1.5 text-[#1a1a1a]"
          >
            <span className="mt-0.5 inline-flex w-[22px] shrink-0 justify-center">
              <ManeuverIcon kind={step.maneuver} />
            </span>
            <span className="min-w-0 flex-1 text-[12px] leading-[1.35]">{step.instruction}</span>
            <span className="shrink-0 pl-1 text-right text-[12px] leading-[1.35] text-[#1a1a1a]">
              {step.distance}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
