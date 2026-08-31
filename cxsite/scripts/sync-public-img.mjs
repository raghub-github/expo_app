/**
 * Copy tracked marketing screenshots from `img/` into `public/img/` so
 * Next.js (and the Docker standalone image) can serve them as `/img/...`.
 * `public/img/` is mostly gitignored — source of truth is `cxsite/img/`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'img')
const destDir = path.join(root, 'public', 'img')

const FILES = ['dnscreen.png', 'ride.png', 'bikeride-phone.png', 'fav.png', 'logo.png', 'onlylogo.png', 'grocery-hero.jpg']

fs.mkdirSync(destDir, { recursive: true })

for (const name of FILES) {
  const from = path.join(srcDir, name)
  const to = path.join(destDir, name)
  if (!fs.existsSync(from)) {
    console.warn(`[sync-public-img] skip missing: img/${name}`)
    continue
  }
  fs.copyFileSync(from, to)
  console.log(`[sync-public-img] ${name}`)
}
