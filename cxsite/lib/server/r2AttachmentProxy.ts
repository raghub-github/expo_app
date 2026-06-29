import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

let s3Client: S3Client | null = null

function getR2Client(): S3Client | null {
  const accessKey = process.env.R2_ACCESS_KEY?.trim()
  const secretKey = process.env.R2_SECRET_KEY?.trim()
  const bucket = process.env.R2_BUCKET_NAME?.trim()
  const endpoint = process.env.R2_ENDPOINT?.trim()
  if (!accessKey || !secretKey || !bucket || !endpoint) return null

  if (!s3Client) {
    const forcePathStyle =
      String(process.env.R2_S3_FORCE_PATH_STYLE || '').toLowerCase() === 'true' ||
      /\.r2\.cloudflarestorage\.com/i.test(endpoint)
    s3Client = new S3Client({
      region: process.env.R2_REGION?.trim() || 'auto',
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      forcePathStyle,
    })
  }
  return s3Client
}

export function normalizeR2ObjectKey(key: string): string {
  let k = (key || '').trim().replace(/^\/+/, '')
  k = k.replace(/^docs\/docs\//, 'docs/')
  return k
}

function decodeKeyParam(raw: string): string {
  let key = raw.trim()
  for (let i = 0; i < 3; i++) {
    if (!/%2f/i.test(key)) break
    try {
      const decoded = decodeURIComponent(key)
      if (decoded === key) break
      key = decoded
    } catch {
      break
    }
  }
  return normalizeR2ObjectKey(key)
}

function keyFromUrlParam(url: string): string | null {
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const u = new URL(url)
      return u.pathname.replace(/^\/+/, '') || null
    }
  } catch {
    return null
  }
  return null
}

/** Parent folder typo seen in DB: GMMMP1005 vs correct GMMP1005 */
function merchantPathTypoVariants(key: string): string[] {
  const out = new Set<string>([key])
  const gmmmp = key.replace(/\/merchants\/GMMMP(\d+)/gi, '/merchants/GMMP$1')
  if (gmmmp !== key) out.add(gmmmp)
  const extraM = key.replace(/\/merchants\/GMMP(\d+)/gi, '/merchants/GMMMP$1')
  if (extraM !== key) out.add(extraM)
  return [...out]
}

function flatMenuToOnboardingKeys(key: string): string[] {
  const re = /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/menu\/([^/]+)$/i
  const m = key.match(re)
  if (!m) return []
  const prefix = m[1].startsWith('docs/') ? m[1] : `docs/${m[1]}`
  const file = m[2]
  const base = `${prefix}/onboarding`
  return [
    `${base}/menu/${file}`,
    `${base}/menu-pdf/${file}`,
    `${base}/menu-images/${file}`,
    `${base}/menu-csv/${file}`,
    `${base}/menu/pdf/${file}`,
    `${base}/menu/images/${file}`,
    `${base}/menu/csv/${file}`,
  ]
}

function onboardingMenuToFlatKeys(key: string): string[] {
  const out: string[] = []
  const reNew =
    /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/onboarding\/menu-(pdf|images|csv)\/([^/]+)$/i
  const m1 = key.match(reNew)
  if (m1) {
    const prefix = m1[1].startsWith('docs/') ? m1[1] : `docs/${m1[1]}`
    out.push(`${prefix}/menu/${m1[3]}`)
  }
  const reOld =
    /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/onboarding\/menu\/(?:pdf|images|csv)\/([^/]+)$/i
  const m2 = key.match(reOld)
  if (m2) {
    const prefix = m2[1].startsWith('docs/') ? m2[1] : `docs/${m2[1]}`
    out.push(`${prefix}/menu/${m2[2]}`)
  }
  return out
}

function onboardingMenuLayoutVariants(key: string): string[] {
  const out: string[] = []
  const base = '(?:docs\\/)?merchants\\/[^/]+(?:\\/stores\\/[^/]+|\\/draft)'
  const reNested = new RegExp(
    `^(${base})\\/onboarding\\/menu\\/(pdf|csv|images)\\/([^/]+)$`,
    'i'
  )
  const m = key.match(reNested)
  if (m) {
    const p = m[1]
    const prefix = p.startsWith('docs/') ? p : `docs/${p}`
    const type = m[2].toLowerCase()
    const file = m[3]
    const legacySeg =
      type === 'pdf' ? 'menu-pdf' : type === 'csv' ? 'menu-csv' : 'menu-images'
    out.push(`${prefix}/onboarding/${legacySeg}/${file}`)
  }
  const reLegacy = new RegExp(
    `^(${base})\\/onboarding\\/menu-(pdf|images|csv)\\/([^/]+)$`,
    'i'
  )
  const m2 = key.match(reLegacy)
  if (m2) {
    const p = m2[1]
    const prefix = p.startsWith('docs/') ? p : `docs/${p}`
    const kind = m2[2].toLowerCase()
    const file = m2[3]
    const sub = kind === 'pdf' ? 'pdf' : kind === 'csv' ? 'csv' : 'images'
    out.push(`${prefix}/onboarding/menu/${sub}/${file}`)
  }
  return out
}

function onboardingFlatMenuReferenceVariants(key: string): string[] {
  const out: string[] = []
  const reOnb =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/menu\/([^/]+)$/i
  const m = key.match(reOnb)
  if (m) {
    const p = m[1].startsWith('docs/') ? m[1] : `docs/${m[1]}`
    const file = m[2]
    if (file && !/^(pdf|csv|images)$/i.test(file)) {
      out.push(`${p}/menu/${file}`)
    }
  }
  const reStore = /^((?:docs\/)?merchants\/[^/]+\/stores\/[^/]+)\/menu\/([^/]+)$/i
  const m2 = key.match(reStore)
  if (m2 && !m2[0].toLowerCase().includes('/onboarding/')) {
    const p = m2[1].startsWith('docs/') ? m2[1] : `docs/${m2[1]}`
    const file = m2[2]
    if (file) out.push(`${p}/onboarding/menu/${file}`)
  }
  return out
}

function onboardingStoreMediaGalleryVariants(key: string): string[] {
  const out: string[] = []
  const reOld =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media\/gallery\/(.+)$/i
  const m = key.match(reOld)
  if (m) {
    const prefix = m[1].startsWith('docs/') ? m[1] : `docs/${m[1]}`
    out.push(`${prefix}/onboarding/store-media-gallery/${m[2]}`)
  }
  const reNew =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media-gallery\/(.+)$/i
  const m2 = key.match(reNew)
  if (m2) {
    const prefix = m2[1].startsWith('docs/') ? m2[1] : `docs/${m2[1]}`
    out.push(`${prefix}/onboarding/store-media/gallery/${m2[2]}`)
  }
  return out
}

/** `.../onboarding/assets/{banner|gallery}/file` <-> legacy `store-media` / `store-media-gallery` */
function onboardingStoreAssetsPathVariants(key: string): string[] {
  const out: string[] = []
  const reAssetsBanner =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/assets\/banner\/([^/]+)$/i
  const mb = key.match(reAssetsBanner)
  if (mb) {
    const prefix = mb[1].startsWith('docs/') ? mb[1] : `docs/${mb[1]}`
    out.push(`${prefix}/onboarding/store-media/${mb[2]}`)
  }
  const reAssetsGallery =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/assets\/gallery\/([^/]+)$/i
  const mg = key.match(reAssetsGallery)
  if (mg) {
    const prefix = mg[1].startsWith('docs/') ? mg[1] : `docs/${mg[1]}`
    out.push(`${prefix}/onboarding/store-media-gallery/${mg[2]}`)
  }
  const reLegacyBanner =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media\/(banner[^/]*)$/i
  const lb = key.match(reLegacyBanner)
  if (lb) {
    const prefix = lb[1].startsWith('docs/') ? lb[1] : `docs/${lb[1]}`
    out.push(`${prefix}/onboarding/assets/banner/${lb[2]}`)
  }
  const reLegacyGallery =
    /^((?:docs\/)?merchants\/[^/]+(?:\/stores\/[^/]+|\/draft))\/onboarding\/store-media-gallery\/([^/]+)$/i
  const lg = key.match(reLegacyGallery)
  if (lg) {
    const prefix = lg[1].startsWith('docs/') ? lg[1] : `docs/${lg[1]}`
    out.push(`${prefix}/onboarding/assets/gallery/${lg[2]}`)
  }
  return out
}

function menuReferencePathVariants(key: string): string[] {
  const out: string[] = []
  const reOld = /^((?:docs\/)?merchants\/[^/]+)\/stores\/([^/]+)\/menu\/(.+)$/i
  const mOld = key.match(reOld)
  if (mOld && !key.includes('/onboarding/')) {
    const base = mOld[1].replace(/^docs\//, '')
    const storeId = mOld[2]
    const file = mOld[3]
    out.push(`${base}/menu/${storeId}/${file}`)
    out.push(`docs/${base}/menu/${storeId}/${file}`)
  }
  const reNew = /^((?:docs\/)?merchants\/[^/]+)\/menu\/([^/]+)\/(.+)$/i
  const mNew = key.match(reNew)
  if (mNew && !key.includes('/onboarding/') && !key.includes('/stores/')) {
    const base = mNew[1].replace(/^docs\//, '')
    const storeId = mNew[2]
    const file = mNew[3]
    out.push(`${base}/stores/${storeId}/menu/${file}`)
    out.push(`docs/${base}/stores/${storeId}/menu/${file}`)
  }
  return out
}

function addWithDocPrefix(seen: Set<string>, s: string) {
  const t = s.trim()
  if (!t) return
  seen.add(t)
  if (t.startsWith('merchants/') && !t.startsWith('docs/')) {
    seen.add(`docs/${t}`)
  } else if (t.startsWith('docs/')) {
    const noDocs = t.replace(/^docs\//, '')
    if (noDocs) seen.add(noDocs)
  }
}

function expandVariantList(seen: Set<string>, variants: string[]) {
  for (const ob of variants) {
    addWithDocPrefix(seen, ob)
  }
}

/**
 * R2 keys historically used `merchants/...`, `docs/merchants/...`, flat `/menu/`,
 * `/onboarding/menu/...`, legacy store-media paths, or `merchant-menu/stores/...`.
 * Mirrors partnersite attachment proxy lookup.
 */
export function expandR2LookupCandidates(primary: string): string[] {
  const k = primary.trim()
  if (!k) return []
  const seen = new Set<string>()

  for (const root of merchantPathTypoVariants(k)) {
    addWithDocPrefix(seen, root)
    if (root.startsWith('merchant-menu/') || root.startsWith('docs/merchant-menu/')) {
      addWithDocPrefix(seen, root.replace(/^docs\//, ''))
      addWithDocPrefix(seen, root.startsWith('docs/') ? root : `docs/${root}`)
    }
    expandVariantList(seen, onboardingMenuToFlatKeys(root))
    expandVariantList(seen, onboardingMenuLayoutVariants(root))
    expandVariantList(seen, onboardingFlatMenuReferenceVariants(root))
    for (const ob of flatMenuToOnboardingKeys(root)) addWithDocPrefix(seen, ob)
    expandVariantList(seen, menuReferencePathVariants(root))
    expandVariantList(seen, onboardingStoreMediaGalleryVariants(root))
    expandVariantList(seen, onboardingStoreAssetsPathVariants(root))
    if (/\/menu_sheet_\d+$/.test(root)) {
      addWithDocPrefix(seen, `${root}.csv`)
    }
  }

  return [...seen]
}

/** Candidate R2 keys — same families as partner menu/gallery uploads. */
export function attachmentKeyCandidates(rawKey: string): string[] {
  const k = decodeKeyParam(rawKey)
  return expandR2LookupCandidates(k)
}

export async function fetchAttachmentFromR2(
  search: string
): Promise<{ body: Buffer; contentType: string } | null> {
  const client = getR2Client()
  const bucket = process.env.R2_BUCKET_NAME?.trim()
  if (!client || !bucket) return null

  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const keys: string[] = []
  const keyParam = params.get('key')
  if (keyParam) keys.push(...attachmentKeyCandidates(keyParam))
  const urlParam = params.get('url')
  if (urlParam) {
    const fromUrl = keyFromUrlParam(decodeURIComponent(urlParam))
    if (fromUrl) keys.push(...attachmentKeyCandidates(fromUrl))
  }
  if (keys.length === 0) return null

  const tried = new Set<string>()
  for (const key of keys) {
    if (tried.has(key)) continue
    tried.add(key)
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key })
      )
      if (!response.Body) continue
      const body = Buffer.from(await response.Body.transformToByteArray())
      const contentType = response.ContentType || 'application/octet-stream'
      return { body, contentType }
    } catch (err: unknown) {
      const code = (err as { name?: string })?.name
      if (code !== 'NoSuchKey' && code !== 'NotFound') {
        console.error('[r2AttachmentProxy]', key, err)
      }
    }
  }
  return null
}
