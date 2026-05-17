import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const chartPath = path.join(__dirname, '../src/components/payments/PaymentsOverviewCharts.tsx');
const pagePath = path.join(__dirname, '../src/app/mx/payments/page.tsx');

let chart = fs.readFileSync(chartPath, 'utf8');
const startMarker = '\n      <motion.div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 flex flex-col">';
const altStart = '\n      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 flex flex-col">';
const idx = chart.indexOf('Recent Payout');
if (idx === -1) {
  console.log('Recent Payout not in charts');
} else {
  let start = chart.lastIndexOf('\n      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 flex flex-col">', idx);
  if (start === -1) start = chart.lastIndexOf(altStart.trim(), idx);
  const before = chart.slice(0, start);
  const after = chart.slice(idx);
  const closeIdx = after.indexOf('\n    </div>\n  );\n}');
  if (start >= 0 && closeIdx >= 0) {
    chart = before + after.slice(closeIdx);
    fs.writeFileSync(chartPath, chart, 'utf8');
    console.log('Removed Recent Payout card');
  }
}

chart = fs.readFileSync(chartPath, 'utf8');
chart = chart.replace(
  '<motion.div className="flex-1 space-y-2">',
  '<div className="flex-1 w-full max-w-md space-y-3 sm:pt-2">'
);
chart = chart.replace(/w-2\.5 h-2\.5/g, 'w-3 h-3');
chart = chart.replace(
  'className="text-xs text-gray-600 font-medium">{label}',
  'className="text-sm text-gray-700 font-medium">{label}'
);
chart = chart.replace(
  'className="text-xs font-semibold text-gray-900">{formatInr(amt)}',
  'className="text-sm font-semibold text-gray-900 tabular-nums">{formatInr(amt)}'
);
chart = chart.replace(
  'className="flex items-center justify-between">',
  'className="flex items-center justify-between gap-4">'
);
chart = chart.replace(/className="flex items-center gap-2">/g, 'className="flex items-center gap-2.5">');
fs.writeFileSync(chartPath, chart, 'utf8');

let page = fs.readFileSync(pagePath, 'utf8');
if (!page.includes("from '@/lib/format-inr'")) {
  page = page.replace(
    /^(import .+ from '@\/hooks\/useMerchantApi';)/m,
    "$1\nimport { formatInr } from '@/lib/format-inr';"
  );
}
if (!page.includes("from '@/lib/format-inr'") && page.includes('useMerchantApi')) {
  const hookIdx = page.indexOf("from '@/hooks/useMerchantApi'");
  if (hookIdx >= 0) {
    const lineEnd = page.indexOf('\n', hookIdx);
    page = page.slice(0, lineEnd + 1) + "import { formatInr } from '@/lib/format-inr';\n" + page.slice(lineEnd + 1);
  }
}

const replacements = [
  [/â‚¹\{?\(wallet\?\.available_balance/g, 'REMOVED'],
  [/â‚¹/g, ''],
  [/â€"/g, '—'],
  [/âˆ'/g, '−'],
  [/Â·/g, '·'],
  [/Ã—/g, '×'],
];

page = page.replace(/toast\.error\('Enter a valid amount \(min â‚¹100\)'\)/g, "toast.error('Enter a valid amount (min ₹100)')");
page = page.replace(
  /toast\.error\('Available balance is below the minimum withdrawal \(â‚¹100\)\.'\)/g,
  "toast.error('Available balance is below the minimum withdrawal (₹100).')"
);
page = page.replace(/Minimum â‚¹100 â€¢ Maximum â‚¹/g, 'Minimum ₹100 • Maximum ');
page = page.replace(/Minimum withdrawal: â‚¹100/g, 'Minimum withdrawal: ₹100');

page = page.replace(
  /â‚¹\{\(wallet\?\.(\w+) \?\? 0\)\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  '{formatInr(wallet?.$1 ?? 0)}'
);
page = page.replace(
  /\{row\.direction === 'CREDIT' \? '\+' : '-'\}â‚¹\{row\.amount\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  "{row.direction === 'CREDIT' ? '+' : '-'}{formatInr(row.amount)}"
);
page = page.replace(
  /â‚¹\{row\.balance_after\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  '{formatInr(row.balance_after)}'
);
page = page.replace(
  /â‚¹\{payoutDetailsCache\[row\.reference_id\]\?\.payout\?\.amount\?\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2 \}\) \?\? 'â€”'\}/g,
  "{payoutDetailsCache[row.reference_id]?.payout?.amount != null ? formatInr(payoutDetailsCache[row.reference_id].payout.amount) : '—'}"
);
page = page.replace(
  /â‚¹\{payoutDetailsCache\[row\.reference_id\]\?\.payout\?\.net_payout_amount\?\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2 \}\) \?\? 'â€”'\}/g,
  "{payoutDetailsCache[row.reference_id]?.payout?.net_payout_amount != null ? formatInr(payoutDetailsCache[row.reference_id].payout.net_payout_amount) : '—'}"
);
page = page.replace(
  /Ã—\{item\.quantity\} Â· â‚¹\{item\.total_price\.toLocaleString\('en-IN'\)\}/g,
  '×{item.quantity} · {formatInr(item.total_price)}'
);
page = page.replace(
  /<span className="absolute left-4 top-1\/2 -translate-y-1\/2 text-gray-600 font-bold text-lg">â‚¹<\/span>/g,
  '<span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-bold text-lg">₹</span>'
);
page = page.replace(
  /â‚¹\{payoutQuote\.requested_amount\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  '{formatInr(payoutQuote.requested_amount)}'
);
page = page.replace(
  /âˆ'â‚¹\{\(payoutQuote\.commission_amount \?\? 0\)\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  '−{formatInr(payoutQuote.commission_amount ?? 0)}'
);
page = page.replace(
  /âˆ'â‚¹\{\(payoutQuote\.gst_on_commission \?\? payoutQuote\.tax_amount \?\? 0\)\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  '−{formatInr(payoutQuote.gst_on_commission ?? payoutQuote.tax_amount ?? 0)}'
);
page = page.replace(
  /âˆ'â‚¹\{\(payoutQuote\.tds_amount \?\? 0\)\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  '−{formatInr(payoutQuote.tds_amount ?? 0)}'
);
page = page.replace(
  /â‚¹\{payoutQuote\.net_payout_amount\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g,
  '{formatInr(payoutQuote.net_payout_amount)}'
);

fs.writeFileSync(pagePath, page, 'utf8');
console.log('page.tsx updated');
