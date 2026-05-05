/** ticket_title_tags junction + ticket_titles.tag_id sync (super-admin title APIs). */

export type TitleTagSqlClient = {
  unsafe: (q: string, v?: unknown[]) => Promise<Record<string, unknown>[]>;
};

export async function replaceTicketTitleTags(
  sqlClient: TitleTagSqlClient,
  titleId: number,
  tagIds: number[]
): Promise<void> {
  const unique = [...new Set(tagIds.filter((n) => Number.isInteger(n) && n > 0))];
  await sqlClient.unsafe(`DELETE FROM ticket_title_tags WHERE ticket_title_id = $1`, [titleId]);
  for (const tid of unique) {
    await sqlClient.unsafe(`INSERT INTO ticket_title_tags (ticket_title_id, tag_id) VALUES ($1, $2)`, [titleId, tid]);
  }
  const first = unique.length > 0 ? unique[0] : null;
  await sqlClient.unsafe(`UPDATE ticket_titles SET tag_id = $1, updated_at = NOW() WHERE id = $2`, [first, titleId]);
}

export type TitleTagDto = { id: number; tagCode: string; tagName: string };

/** Build tags + tagIds for API from row including optional title_tags_json (json_agg from junction). */
export function mapTitleTagsFromRow(r: Record<string, unknown>): { tags: TitleTagDto[]; tagIds: number[] } {
  let parsed: unknown = r.title_tags_json;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed) as unknown;
    } catch {
      parsed = null;
    }
  }
  let tags: TitleTagDto[] = [];
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const id = Number(o.id);
        if (!Number.isFinite(id)) continue;
        tags.push({
          id,
          tagCode: String(o.tagCode ?? o.tag_code ?? ""),
          tagName: String(o.tagName ?? o.tag_name ?? ""),
        });
      }
    }
  }
  const legacyId = r.tag_id != null ? Number(r.tag_id) : null;
  if (tags.length === 0 && legacyId != null && Number.isFinite(legacyId)) {
    tags = [
      {
        id: legacyId,
        tagCode: String(r.resolved_tag_code ?? ""),
        tagName: String(r.resolved_tag_name ?? ""),
      },
    ];
  }
  const tagIds = tags.map((t) => t.id);
  return { tags, tagIds };
}
