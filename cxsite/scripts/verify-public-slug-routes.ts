/**
 * HTTP verification for public slug routes (run while cxsite dev server is up on :3003).
 * Usage: npx tsx scripts/verify-public-slug-routes.ts
 */
const BASE = process.env.CXSITE_BASE_URL ?? 'http://localhost:3003'

type Check = { name: string; ok: boolean; detail: string }

async function fetchHead(url: string, redirect: RequestRedirect = 'manual') {
  const res = await fetch(url, { redirect, headers: { 'User-Agent': 'GatiMitraSlugAudit/1.0' } })
  const loc = res.headers.get('location')
  const text = res.status >= 200 && res.status < 400 ? await res.text() : ''
  return { status: res.status, location: loc, text }
}

async function main() {
  const checks: Check[] = []
  let oldIdTests = 0
  let slugTests = 0

  const slugs = [
    'swaad-sutra-panipat',
    'golgappa1-paschim-medinipur',
    'jha-pan-bhandar-panipat',
  ]
  const oldIds = ['GMMC1026', 'GMMC1015', 'GMMC1027']

  for (const id of oldIds) {
    oldIdTests += 1
    const { status, location } = await fetchHead(`${BASE}/restaurant/${id}`)
    const ok = (status === 301 || status === 308 || status === 307) && Boolean(location?.includes('/restaurant/'))
    const chain = location?.includes('GMMC') ? 'CHAIN_WITH_INTERNAL_ID' : 'OK'
    checks.push({
      name: `Old ID redirect ${id}`,
      ok: ok && chain === 'OK',
      detail: `status=${status} location=${location ?? 'none'}`,
    })
  }

  for (const slug of slugs) {
    slugTests += 1
    const { status, text } = await fetchHead(`${BASE}/restaurant/${slug}`, 'follow')
    const hasCanonical = text.includes(`rel="canonical"`) && text.includes(`/restaurant/${slug}`)
    const hasGmmc = /GMMC\d+/i.test(text)
    const hasJsonLd = text.includes('"@type":"Restaurant"') && text.includes(`/restaurant/${slug}`)
    checks.push({
      name: `Slug page ${slug}`,
      ok: status === 200 && hasCanonical && hasJsonLd && !hasGmmc,
      detail: `status=${status} canonical=${hasCanonical} jsonld=${hasJsonLd} gmmcInHtml=${hasGmmc}`,
    })
  }

  slugTests += 1
  const invalid = await fetchHead(`${BASE}/restaurant/does-not-exist-xyz-404`, 'follow')
  checks.push({
    name: 'Invalid slug still renders store inner page',
    ok: invalid.status === 200,
    detail: `status=${invalid.status}`,
  })

  const sm = await fetchHead(`${BASE}/sitemap.xml`, 'follow')
  const smHasSlug = slugs.every((s) => sm.text.includes(`/restaurant/${s}`))
  const smHasGmmc = /GMMC\d+/i.test(sm.text)
  checks.push({
    name: 'Sitemap slug URLs',
    ok: sm.status === 200 && smHasSlug && !smHasGmmc,
    detail: `status=${sm.status} slugs=${smHasSlug} gmmc=${smHasGmmc}`,
  })

  const api = await fetch(`${BASE}/api/restaurants/swaad-sutra-panipat`)
  const apiJson = api.ok ? await api.json() : {}
  const apiHasGmmc = JSON.stringify(apiJson).includes('GMMC')
  checks.push({
    name: 'Public store API no GMMC',
    ok: api.ok && !apiHasGmmc && Boolean(apiJson.public_slug),
    detail: `status=${api.status} gmmc=${apiHasGmmc} public_slug=${apiJson.public_slug ?? 'missing'}`,
  })

  console.log('\n=== ROUTE VERIFICATION ===')
  console.log(JSON.stringify({ oldIdTests, slugTests, checks }, null, 2))
  const failed = checks.filter((c) => !c.ok)
  if (failed.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
