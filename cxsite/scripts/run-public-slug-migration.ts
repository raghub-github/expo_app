/**
 * Run migration 0215 + backfill + audit metrics.
 * Usage: npx tsx scripts/run-public-slug-migration.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import postgres from 'postgres'
import {
  buildSlugForStoreRow,
  disambiguateStoreSlug,
} from '../lib/storeSlug'

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i < 0) continue
      const k = t.slice(0, i).trim()
      const v = t.slice(i + 1).trim()
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal()

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL required')
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1 })

async function main() {
  const migrationPath = join(process.cwd(), 'drizzle/0215_merchant_stores_public_slug.sql')
  const migrationSql = readFileSync(migrationPath, 'utf8')
  console.log('Applying migration 0215_merchant_stores_public_slug.sql...')
  await sql.unsafe(migrationSql)
  console.log('Migration applied.')

  const enforcePath = join(process.cwd(), 'drizzle/0216_merchant_stores_public_slug_enforce.sql')
  const enforceSql = readFileSync(enforcePath, 'utf8')
  console.log('Applying migration 0216_merchant_stores_public_slug_enforce.sql...')
  await sql.unsafe(enforceSql)
  console.log('Enforce migration applied.')

  const takenRows = await sql<{ public_slug: string }[]>`
    SELECT public_slug FROM merchant_stores WHERE public_slug IS NOT NULL
  `
  const taken = new Set(
    takenRows.map((r) => String(r.public_slug ?? '').trim()).filter(Boolean)
  )

  const missing = await sql<
    {
      id: number
      store_id: string
      store_name: string
      store_display_name: string | null
      city: string
      landmark: string | null
    }[]
  >`
    SELECT id, store_id, store_name, store_display_name, city, landmark
    FROM merchant_stores
    WHERE deleted_at IS NULL
      AND approval_status = 'APPROVED'
      AND status = 'ACTIVE'
      AND is_active = true
      AND public_slug IS NULL
  `

  let backfilled = 0
  for (const row of missing) {
    const base = buildSlugForStoreRow(row)
    const slug = disambiguateStoreSlug(base, taken, row.landmark)
    taken.add(slug)
    await sql`
      UPDATE merchant_stores SET public_slug = ${slug}
      WHERE id = ${row.id} AND public_slug IS NULL
    `
    console.log(`Backfill: ${row.store_id} → ${slug}`)
    backfilled += 1
  }

  const [activeCount] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM merchant_stores
    WHERE deleted_at IS NULL AND approval_status = 'APPROVED' AND status = 'ACTIVE' AND is_active = true
  `
  const [slugCount] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM merchant_stores
    WHERE deleted_at IS NULL AND approval_status = 'APPROVED' AND status = 'ACTIVE' AND is_active = true
      AND public_slug IS NOT NULL
  `
  const [missingCount] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM merchant_stores
    WHERE deleted_at IS NULL AND approval_status = 'APPROVED' AND status = 'ACTIVE' AND is_active = true
      AND public_slug IS NULL
  `
  const dupes = await sql<{ public_slug: string; c: number }[]>`
    SELECT public_slug, COUNT(*)::int AS c
    FROM merchant_stores
    WHERE public_slug IS NOT NULL
    GROUP BY public_slug
    HAVING COUNT(*) > 1
  `
  const indexes = await sql<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'merchant_stores' AND indexname LIKE '%public_slug%'
  `

  console.log('\n=== AUDIT METRICS ===')
  console.log(JSON.stringify({
    activeStores: activeCount?.n ?? 0,
    withPublicSlug: slugCount?.n ?? 0,
    missingPublicSlug: missingCount?.n ?? 0,
    duplicateSlugs: dupes.length,
    duplicateSlugValues: dupes,
    publicSlugIndexes: indexes.map((i) => i.indexname),
    backfilledThisRun: backfilled,
  }, null, 2))

  await sql.end()
}

main().catch(async (e) => {
  console.error(e)
  await sql.end()
  process.exit(1)
})
