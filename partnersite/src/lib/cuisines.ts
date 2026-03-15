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
 * Upsert cuisines for a store.
 * - Ensures cuisine_master has one row per slug.
 * - Ensures merchant_store_cuisines links store -> cuisines.
 */
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

  const cuisineIds: number[] = [];

  for (const name of cleaned) {
    const slug = slugifyCuisine(name);
    const { data: existing } = await db
      .from('cuisine_master')
      .select('id, name')
      .eq('slug', slug)
      .maybeSingle();

    let cuisineId: number | null = existing?.id ?? null;

    if (!cuisineId) {
      const { data: inserted, error } = await db
        .from('cuisine_master')
        .insert([{ slug, name, is_default: true }])
        .select('id')
        .single();
      if (error || !inserted) {
        console.error('[cuisines] insert cuisine_master failed', error);
        continue;
      }
      cuisineId = inserted.id as number;
    }

    cuisineIds.push(cuisineId);

    // Link store -> cuisine (ignore duplicates)
    await db
      .from('merchant_store_cuisines')
      .upsert(
        { store_id: storePkId, cuisine_id: cuisineId, custom_name: name },
        { onConflict: 'store_id,cuisine_id' }
      );
  }
}

/** Get distinct cuisine names configured for a store (custom name or master name). */
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

