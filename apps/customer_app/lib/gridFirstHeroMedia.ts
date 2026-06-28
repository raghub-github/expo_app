export const GRID_FIRST_HERO_MEDIA_KINDS = ["image", "video"] as const;

export type GridFirstHeroMediaKind = (typeof GRID_FIRST_HERO_MEDIA_KINDS)[number];

export type GridFirstHeroMediaItem = {
  id: string;
  kind: GridFirstHeroMediaKind;
  url: string;
  sortOrder: number;
};

function parseKind(value: unknown): GridFirstHeroMediaKind | null {
  if (value === "image" || value === "video") return value;
  return null;
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
    });
  }
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}
