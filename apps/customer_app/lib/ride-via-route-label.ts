/**
 * Pick a short "Via" label from routing steps — prefer NH / SH (Indian highways).
 */

type NamedStep = {
  name?: string | null;
  ref?: string | null;
  destinations?: string | null;
  distance?: number | null;
  intersections?: Array<{ ref?: string | null } | null> | null;
};

const SKIP_NAME = /^(unnamed|unknown|road|street|path|track|-)?$/i;

function normalizeHighwayCode(raw: string): string | null {
  const compact = raw.replace(/\s+/g, " ").trim();
  let match = compact.match(/\bNH\s*-?\s*(\d+[A-Z]?)\b/i);
  if (match) return `NH ${match[1]!.toUpperCase()}`;
  match = compact.match(/\bSH\s*-?\s*(\d+[A-Z]?)\b/i);
  if (match) return `SH ${match[1]!.toUpperCase()}`;
  match = compact.match(/\bAH\s*-?\s*(\d+[A-Z]?)\b/i);
  if (match) return `AH ${match[1]!.toUpperCase()}`;
  match = compact.match(/\bNational\s+Highway\s+(\d+[A-Z]?)\b/i);
  if (match) return `NH ${match[1]!.toUpperCase()}`;
  match = compact.match(/\bState\s+Highway\s+(\d+[A-Z]?)\b/i);
  if (match) return `SH ${match[1]!.toUpperCase()}`;
  return null;
}

function topKeys(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function addNamedPiece(
  raw: string | null | undefined,
  meters: number,
  highways: Map<string, number>,
  roads: Map<string, number>
): void {
  if (!raw?.trim()) return;
  for (const part of raw.split(/[;,|/]+/)) {
    const piece = part.trim();
    if (!piece || SKIP_NAME.test(piece)) continue;
    const code = normalizeHighwayCode(piece);
    if (code) {
      highways.set(code, (highways.get(code) ?? 0) + meters);
    } else {
      roads.set(piece, (roads.get(piece) ?? 0) + meters);
    }
  }
}

export function extractViaRouteLabel(steps: NamedStep[] | null | undefined): string | null {
  if (!steps?.length) return null;

  const highways = new Map<string, number>();
  const roads = new Map<string, number>();

  for (const step of steps) {
    const dist = Number(step.distance);
    const meters = Number.isFinite(dist) && dist > 0 ? dist : 0;
    addNamedPiece(step.ref, meters, highways, roads);
    addNamedPiece(step.name, meters, highways, roads);
    addNamedPiece(step.destinations, meters, highways, roads);
    for (const intersection of step.intersections ?? []) {
      addNamedPiece(intersection?.ref, meters, highways, roads);
    }
  }

  const hwyTop = topKeys(highways, 2);
  if (hwyTop.length > 0) return hwyTop.join(" · ");
  const roadTop = topKeys(roads, 1);
  return roadTop[0] ?? null;
}
