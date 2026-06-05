import type { LatLng, NavigationRoute, NavigationStep } from "@/src/services/maps/directions.service";
import { bearingDegrees } from "@/src/lib/navigation-route-progress";

export type ActiveManeuverDisplay = {
  primary: string;
  /** Short label e.g. "Turn left". */
  title: string;
  /** Distance to this maneuver in metres. */
  distanceAheadM?: number;
  secondary?: string;
  thenLabel?: string;
  icon: "straight" | "left" | "right" | "slight-left" | "slight-right" | "uturn" | "arrive" | "depart";
};

export function formatDistanceAhead(meters?: number): string | undefined {
  if (meters == null || !Number.isFinite(meters)) return undefined;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km ahead`;
  return `${Math.max(10, Math.round(meters / 10) * 10)} m ahead`;
}

function maneuverTitle(instruction: string): string {
  const t = cleanInstruction(instruction);
  const prefix = t.match(
    /^(Turn(?:\s+(?:slightly|sharp))?\s+(?:left|right)|Head\s+\w+|Continue(?:\s+straight)?|Keep\s+\w+)/i
  );
  if (prefix) return prefix[0]!;
  const beforeOnto = t.split(/\s+onto\s+/i)[0]?.trim();
  return beforeOnto && beforeOnto.length <= 36 ? beforeOnto : t.slice(0, 36);
}

function thenShortLabel(instruction: string): string {
  const t = cleanInstruction(instruction);
  const turn = t.match(/^(Turn(?:\s+(?:slightly|sharp))?\s+(?:left|right))/i);
  if (turn) return turn[0]!;
  return maneuverTitle(t);
}

function distanceRemainingOnStep(
  steps: NavigationStep[],
  stepIndex: number,
  traveledM: number
): number {
  let acc = 0;
  for (let i = 0; i < stepIndex; i++) acc += steps[i]!.distanceM;
  const step = steps[stepIndex];
  if (!step) return 0;
  const end = acc + step.distanceM;
  return Math.max(0, Math.min(step.distanceM, end - traveledM));
}

const CARDINALS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"] as const;

export function bearingToCardinal(bearingDeg: number): string {
  const idx = Math.round(((bearingDeg % 360) + 360) % 360 / 45) % 8;
  return CARDINALS[idx] ?? "north";
}

export function formatHeadInstruction(bearingDeg: number): string {
  return `Head ${bearingToCardinal(bearingDeg)}`;
}

function iconFromModifier(modifier?: string, type?: string): ActiveManeuverDisplay["icon"] {
  const m = (modifier ?? type ?? "").toLowerCase();
  if (m.includes("uturn") || m.includes("u-turn")) return "uturn";
  if (m.includes("slight") && m.includes("left")) return "slight-left";
  if (m.includes("slight") && m.includes("right")) return "slight-right";
  if (m.includes("sharp") && m.includes("left")) return "left";
  if (m.includes("sharp") && m.includes("right")) return "right";
  if (m.includes("left")) return "left";
  if (m.includes("right")) return "right";
  if (m.includes("arrive")) return "arrive";
  if (m.includes("depart") || m.includes("start")) return "depart";
  return "straight";
}

function cleanInstruction(raw: string): string {
  return raw
    .replace(/\$[^$]*\$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenInstruction(raw: string): string {
  const t = cleanInstruction(raw);
  if (t.length <= 42) return t;
  const head = t.match(/^Head\s+\w+/i);
  if (head) return head[0]!;
  const turn = t.match(/^(Turn|Continue|Keep)[^.]*/i);
  if (turn) return turn[0]!.slice(0, 42);
  return `${t.slice(0, 39)}…`;
}

function pickStepIndex(steps: NavigationStep[], traveledM: number): number {
  if (!steps.length) return 0;
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    acc += step.distanceM;
    if (traveledM < acc) return i;
  }
  return Math.max(0, steps.length - 1);
}

export function getWrongWayManeuverDisplay(
  offRouteM: number,
  routeBearingDeg: number
): ActiveManeuverDisplay {
  const head = formatHeadInstruction((routeBearingDeg + 180) % 360);
  const dist =
    offRouteM >= 1000
      ? `${(offRouteM / 1000).toFixed(1)} km`
      : `${Math.max(10, Math.round(offRouteM / 10) * 10)} m`;
  return {
    primary: `You're going the wrong way. Return to the route (${dist} off route).`,
    title: "Wrong way",
    distanceAheadM: Math.max(10, Math.round(offRouteM)),
    secondary: head,
    thenLabel: head,
    icon: "uturn",
  };
}

export function getActiveManeuverDisplay(
  route: NavigationRoute | null,
  remaining: LatLng[],
  remainingDistanceM: number,
  rider?: LatLng & { headingDeg?: number }
): ActiveManeuverDisplay | null {
  if (!route || remaining.length < 1) return null;

  const totalM = Math.max(1, route.distanceKm * 1000);
  const traveledM = Math.max(0, totalM - remainingDistanceM);

  if (route.steps?.length) {
    const idx = pickStepIndex(route.steps, traveledM);
    const current = route.steps[idx];
    const next = route.steps[idx + 1];
    if (current) {
      const aheadM = distanceRemainingOnStep(route.steps, idx, traveledM);
      const title = maneuverTitle(current.instruction);
      return {
        primary: shortenInstruction(current.instruction),
        title,
        distanceAheadM: aheadM,
        secondary: next ? shortenInstruction(next.instruction) : undefined,
        thenLabel: next ? thenShortLabel(next.instruction) : undefined,
        icon: iconFromModifier(current.modifier, current.maneuverType),
      };
    }
  }

  const from = rider ?? remaining[0];
  const to = remaining.length >= 2 ? remaining[1]! : remaining[remaining.length - 1]!;
  if (!from || !to) return null;

  const bearing = bearingDegrees(from, to);
  const head = formatHeadInstruction(bearing);
  return {
    primary: head,
    title: head,
    distanceAheadM: remainingDistanceM,
    icon: iconFromModifier(undefined, "depart"),
  };
}
