export const GRID_FIRST_HERO_MEDIA_KINDS = ["image", "video"] as const;

export type GridFirstHeroMediaKind = (typeof GRID_FIRST_HERO_MEDIA_KINDS)[number];

export type GridFirstHeroMediaItem = {
  id: string;
  kind: GridFirstHeroMediaKind;
  url: string;
  sortOrder: number;
  /** width / height when known (from upload probe or client measure). */
  aspectRatio?: number | null;
};

export const MAX_GRID_FIRST_HERO_MEDIA = 10;

function parseKind(value: unknown): GridFirstHeroMediaKind | null {
  if (value === "image" || value === "video") return value;
  return null;
}

function parseAspectRatio(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0.15 || n > 8) return null;
  return Number(n.toFixed(4));
}

export function parseGridFirstHeroMediaItems(value: unknown): GridFirstHeroMediaItem[] {
  if (!Array.isArray(value)) return [];
  const items: GridFirstHeroMediaItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const url = typeof row.url === "string" ? row.url.trim() : "";
    const kind = parseKind(row.kind);
    const sortOrder = Number(row.sortOrder);
    if (!id || !url || !kind) continue;
    items.push({
      id,
      kind,
      url,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : items.length,
      aspectRatio: parseAspectRatio(row.aspectRatio ?? row.aspect_ratio),
    });
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
