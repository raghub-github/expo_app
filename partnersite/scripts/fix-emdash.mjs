import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const pagePath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/app/mx/payments/page.tsx');
let page = fs.readFileSync(pagePath, 'utf8');

const idx = page.indexOf('upi_id');
if (idx >= 0) {
  const snippet = page.slice(idx, idx + 80);
  const dashIdx = snippet.indexOf("'") + 1;
  const sub = snippet.slice(dashIdx, dashIdx + 6);
  console.log(
    'dash chars:',
    [...sub].map((c) => `${c} U+${c.charCodeAt(0).toString(16)}`)
  );
}

// Common UTF-8 misread as Windows-1252: em dash, en dash
const MOJIBAKE_EM = '\u00e2\u20ac\u201d'; // â€"
const MOJIBAKE_EM_ALT = '\u00e2\u20ac\u201c';
page = page.split(MOJIBAKE_EM).join('\u2014');
page = page.split(MOJIBAKE_EM_ALT).join('\u2014');
page = page.split('\u00e2\u20ac\u201d').join('\u2014');
page = page.split('\u00e2\u20ac\u201c').join('\u2014');
page = page.split('\u00e2\u20ac\u2014').join('\u2014');

fs.writeFileSync(pagePath, page, 'utf8');
console.log('done, remaining â count:', (page.match(/\u00e2/g) || []).length);
