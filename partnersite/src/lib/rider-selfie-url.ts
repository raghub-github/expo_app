import type { SupabaseClient } from "@supabase/supabase-js";
import { toStoredDocumentUrl } from "@/lib/r2";

const PENDING_FILE_URL = "pending";
const SELFIE_DOC_TYPES = ["selfie", "profile_photo"] as const;

function toViewUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === PENDING_FILE_URL) return null;
  return toStoredDocumentUrl(trimmed);
}

/** Browser-loadable selfie URL (proxy for R2 keys / legacy paths). */
export function resolveRiderSelfieFromStored(raw: string | null | undefined): string | null {
  return toViewUrl(raw);
}

export async function getRiderSelfieViewUrl(
  db: SupabaseClient,
  riderId: number
): Promise<string | null> {
  const { data: rider } = await db
    .from("riders")
    .select("selfie_url")
    .eq("id", riderId)
    .maybeSingle();

  let url = toViewUrl((rider as { selfie_url?: string | null } | null)?.selfie_url);
  if (url) return url;

  const { data: doc } = await db
    .from("rider_documents")
    .select("id, file_url, r2_key")
    .eq("rider_id", riderId)
    .in("doc_type", [...SELFIE_DOC_TYPES])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!doc) return null;

  const docRow = doc as { id: number; file_url: string; r2_key: string | null };
  url = toViewUrl(docRow.r2_key ?? docRow.file_url);
  if (url) return url;

  const { data: file } = await db
    .from("rider_document_files")
    .select("file_url, r2_key")
    .eq("document_id", docRow.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  url = toViewUrl(
    (file as { file_url?: string; r2_key?: string | null } | null)?.r2_key ??
      (file as { file_url?: string } | null)?.file_url
  );
  if (url) return url;

  return toViewUrl(`riders/${riderId}/documents/selfie/latest.jpg`);
}

export async function buildRiderSelfieUrlMap(
  db: SupabaseClient,
  riderIds: number[]
): Promise<Map<number, string | null>> {
  const map = new Map<number, string | null>();
  await Promise.all(
    riderIds.map(async (id) => {
      try {
        map.set(id, await getRiderSelfieViewUrl(db, id));
      } catch {
        map.set(id, null);
      }
    })
  );
  return map;
}
