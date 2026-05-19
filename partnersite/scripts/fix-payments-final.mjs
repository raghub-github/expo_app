import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const chartPath = path.join(root, 'src/components/payments/PaymentsOverviewCharts.tsx');
const pagePath = path.join(root, 'src/app/mx/payments/page.tsx');

// Remove Recent Payout card
{
  const lines = fs.readFileSync(chartPath, 'utf8').split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes('Recent Payout'));
  if (i >= 0) {
    let s = i;
    while (s > 0 && !lines[s].includes('bg-white rounded-lg shadow-sm p-4 border border-gray-200 flex flex-col')) s--;
    let depth = 0;
    let e = s;
    for (let j = s; j < lines.length; j++) {
      depth += (lines[j].match(/<div/g) || []).length;
      depth -= (lines[j].match(/<\/motion.div>/g) || []).length;
      depth -= (lines[j].match(/<\/motion.div>/g) || []).length;
      depth -= (lines[j].match(/<\/div>/g) || []).length;
      if (j > s && depth <= 0) {
        e = j;
        break;
      }
    }
    lines.splice(s, e - s + 1);
    let text = lines.join('\n');
    text = text.replace(
      'className="flex-1 space-y-2"',
      'className="flex-1 w-full max-w-md space-y-3 sm:pt-2"'
    );
    fs.writeFileSync(chartPath, text, 'utf8');
    console.log('charts: removed lines', s, '-', e);
  }
}

// Fix page encoding + payout deductions
{
  let page = fs.readFileSync(pagePath, 'utf8');
  const fixes = [
    ['â€"', '—'],
    ['â€"', '—'],
    ['â€"', '—'],
    ['â€“', '–'],
    ['â†’', '→'],
    ['Â·', '·'],
    ['Ã—', '×'],
    ['2â€"3', '2–3'],
    ['2â€“3', '2–3'],
  ];
  for (const [from, to] of fixes) {
    page = page.split(from).join(to);
  }
  page = page.replace(
    /<span className="font-semibold text-amber-600">[^<]*\{\(payoutQuote\.commission_amount \?\? 0\)[^<]*<\/span>/,
    '<span className="font-semibold text-amber-600">−{formatInr(payoutQuote.commission_amount ?? 0)}</span>'
  );
  page = page.replace(
    /<span className="font-semibold text-amber-600">[^<]*\{\(payoutQuote\.gst_on_commission \?\? payoutQuote\.tax_amount \?\? 0\)[^<]*<\/span>/,
    '<span className="font-semibold text-amber-600">−{formatInr(payoutQuote.gst_on_commission ?? payoutQuote.tax_amount ?? 0)}</span>'
  );
  page = page.replace(
    /<span className="font-semibold text-red-600">[^<]*\{\(payoutQuote\.tds_amount \?\? 0\)[^<]*<\/span>/,
    '<span className="font-semibold text-red-600">−{formatInr(payoutQuote.tds_amount ?? 0)}</span>'
  );
  page = page.replace(/\u2014/g, '\u2014');
  page = page.replace(/[\u00e2\u20ac][\u00a0-\u00bf\u201c\u201d]?/g, (m) => {
    if (m.includes('\u20ac') || m.startsWith('\u00e2')) return '\u2014';
    return m;
  });
  page = page.replace(/'â€[\u201c\u201d\u0080-\u009f]?/g, "'\u2014'");
  page = page.replace(/'â€"/g, "'\u2014'");
  page = page.replace(/'â€”'/g, "'\u2014'");
  page = page.replace(/\|\| 'â€"/g, "|| '\u2014'");
  page = page.replace(/\|\| 'â€"/g, "|| '\u2014'");
  page = page.replace(/ ?? 'â€"/g, " ?? '\u2014'");
  page = page.replace(/'â€"/g, "'\u2014'");
  fs.writeFileSync(pagePath, page, 'utf8');
  const left = (page.match(/\u00e2/g) || []).length;
  console.log('page: encoding + deductions fixed, remaining latin extended artifacts:', left);
}
