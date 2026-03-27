import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function slugifyCuisine(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'cuisine';
}

function normalizeCuisineName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  // Title-case basic normalization
  return trimmed
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Ensure merchant_store_cuisines matches legacy merchant_stores.cuisine_types (text[]).
 * Only names that resolve to existing cuisine_master rows are linked — never inserts into cuisine_master.
 */
export async function syncLegacyCuisineTypesFromMerchantStore(storePkId: number): Promise<void> {
  if (!storePkId) return;
  const db = getSupabaseAdmin();
  const { data: store, error } = await db
    .from('merchant_stores')
    .select('cuisine_types')
    .eq('id', storePkId)
    .maybeSingle();
  if (error || !store) return;
  const arr = store.cuisine_types;
  if (!Array.isArray(arr) || arr.length === 0) return;
  const names = arr.filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
  if (names.length === 0) return;
  await upsertStoreCuisines(storePkId, names);
}

export async function upsertStoreCuisines(storePkId: number, cuisineNames: string[]): Promise<void> {
  if (!storePkId || !Array.isArray(cuisineNames)) return;
  const db = getSupabaseAdmin();

  const cleaned = Array.from(
    new Set(
      cuisineNames
        .map((n) => normalizeCuisineName(n))
        .filter((n) => n.length > 0)
    )
  );
  if (cleaned.length === 0) return;

  for (const name of cleaned) {
    const slug = slugifyCuisine(name);
    const { data: bySlug } = await db
      .from('cuisine_master')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    let cuisineId: number | null = (bySlug?.id as number | undefined) ?? null;

    if (!cuisineId) {
      const { data: byName } = await db
        .from('cuisine_master')
        .select('id')
        .eq('name', name)
        .maybeSingle();
      cuisineId = (byName?.id as number | undefined) ?? null;
    }

    if (!cuisineId) {
      console.warn('[cuisines] skip — not in cuisine_master:', name);
      continue;
    }

    await db
      .from('merchant_store_cuisines')
      .upsert(
        { store_id: storePkId, cuisine_id: cuisineId, custom_name: name },
        { onConflict: 'store_id,cuisine_id' }
      );
  }
}

/** Get distinct cuisine names configured for a store (custom name or master name). */
/** Linked cuisines with cuisine_master.id for category forms. */
export async function getLinkedCuisinesDetailed(
  storePkId: number
): Promise<Array<{ id: number; name: string; is_system_defined: boolean }>> {
  if (!storePkId) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('merchant_store_cuisines')
    .select('custom_name, cuisine_master ( id, name, is_default )')
    .eq('store_id', storePkId);
  if (error || !data) {
    if (error) console.error('[cuisines] getLinkedCuisinesDetailed error', error);
    return [];
  }
  const out: Array<{ id: number; name: string; is_system_defined: boolean }> = [];
  for (const row of data as any[]) {
    const cm = row.cuisine_master;
    if (!cm || typeof cm.id !== 'number') continue;
    const name =
      (typeof row.custom_name === 'string' && row.custom_name.trim()
        ? normalizeCuisineName(row.custom_name)
        : normalizeCuisineName(String(cm.name || ''))) || String(cm.name || '');
    if (!name) continue;
    out.push({
      id: cm.id,
      name,
      is_system_defined: Boolean(cm.is_default),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return out;
}

/** Active cuisine_master rows not linked to this store. */
export async function getCatalogCuisinesNotLinked(storePkId: number): Promise<
  Array<{ id: number; name: string; is_system_defined: boolean }>
> {
  if (!storePkId) return [];
  const db = getSupabaseAdmin();
  const { data: linked, error: le } = await db
    .from('merchant_store_cuisines')
    .select('cuisine_id')
    .eq('store_id', storePkId);
  if (le) {
    console.error('[cuisines] getCatalogCuisinesNotLinked linked', le);
    return [];
  }
  const linkedIds = new Set(
    (linked || []).map((r: { cuisine_id?: number }) => r.cuisine_id).filter((id): id is number => typeof id === 'number')
  );
  const { data: all, error } = await db
    .from('cuisine_master')
    .select('id, name, is_default')
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true });
  if (error || !all) {
    if (error) console.error('[cuisines] getCatalogCuisinesNotLinked master', error);
    return [];
  }
  return (all as { id: number; name: string; is_default: boolean }[])
    .filter((r) => !linkedIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: normalizeCuisineName(r.name),
      is_system_defined: Boolean(r.is_default),
    }));
}

export async function getCuisinesForStore(storePkId: number): Promise<string[]> {
  if (!storePkId) return [];
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('merchant_store_cuisines')
    .select('custom_name, cuisine:cuisine_master(name)')
    .eq('store_id', storePkId);

  if (error || !data) {
    if (error) console.error('[cuisines] getCuisinesForStore error', error);
    return [];
  }

  const names = data
    .map((row: any) => row.custom_name || row.cuisine?.name)
    .filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n: string) => normalizeCuisineName(n));

  return Array.from(new Set(names));
}

/** Get default master cuisines (for onboarding lists). */
export async function getDefaultCuisines(): Promise<string[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('cuisine_master')
    .select('name')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[cuisines] getDefaultCuisines error', error);
    return [];
  }
  if (!data) return [];
  const names = data
    .map((row: any) => row.name)
    .filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
    .map((n: string) => normalizeCuisineName(n));
  return Array.from(new Set(names));
}

