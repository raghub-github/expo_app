/**
 * Database audit metrics for public_slug migration.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import postgres from 'postgres'

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
  const [active] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM merchant_stores
    WHERE deleted_at IS NULL AND approval_status = 'APPROVED' AND status = 'ACTIVE' AND is_active = true
  `
  const [withSlug] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM merchant_stores
    WHERE deleted_at IS NULL AND approval_status = 'APPROVED' AND status = 'ACTIVE' AND is_active = true
      AND public_slug IS NOT NULL AND TRIM(public_slug) <> ''
  `
  const [missing] = await sql<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM merchant_stores
    WHERE deleted_at IS NULL AND approval_status = 'APPROVED' AND status = 'ACTIVE' AND is_active = true
      AND (public_slug IS NULL OR TRIM(public_slug) = '')
  `
  const dupes = await sql<{ public_slug: string; c: number }[]>`
    SELECT public_slug, COUNT(*)::int AS c FROM merchant_stores
    WHERE public_slug IS NOT NULL GROUP BY public_slug HAVING COUNT(*) > 1
  `
  const indexes = await sql<{ indexname: string; indexdef: string }[]>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'merchant_stores' AND indexname LIKE '%public_slug%'
  `
  const stores = await sql<{ store_id: string; public_slug: string; store_name: string; city: string }[]>`
    SELECT store_id, public_slug, COALESCE(store_display_name, store_name) AS store_name, city
    FROM merchant_stores
    WHERE deleted_at IS NULL AND approval_status = 'APPROVED' AND status = 'ACTIVE' AND is_active = true
    ORDER BY store_id
  `

  console.log(JSON.stringify({
    activeStores: active?.n ?? 0,
    withPublicSlug: withSlug?.n ?? 0,
    missingPublicSlug: missing?.n ?? 0,
    duplicateSlugCount: dupes.length,
    duplicateSlugs: dupes,
    indexes,
    stores,
  }, null, 2))

  await sql.end()
}

main().catch(async (e) => {
  console.error(e)
  await sql.end()
  process.exit(1)
})
