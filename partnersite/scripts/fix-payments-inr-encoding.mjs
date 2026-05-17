import fs from 'fs';
const p = new URL('../src/app/mx/payments/page.tsx', import.meta.url);
let s = fs.readFileSync(p, 'utf8');
const fixes = [
  [/â‚¹/g, '\u20B9'],
  [/â€"/g, '\u2014'],
  [/âˆ'/g, '\u2212'],
  [/â€¢/g, '\u2022'],
  [/Ã—/g, '\u00D7'],
  [/Â·/g, '\u00B7'],
];
for (const [re, rep] of fixes) s = s.replace(re, rep);
if (!s.includes("from '@/lib/format-inr'")) {
  s = s.replace(
    "import { PaymentsOverviewCharts } from '@/components/payments/PaymentsOverviewCharts'",
    "import { PaymentsOverviewCharts } from '@/components/payments/PaymentsOverviewCharts'\nimport { formatInr } from '@/lib/format-inr'"
  );
}
const walletAmountRe =
  /\u20B9\{\((wallet\?\.[\w_]+ ?? 0)\)\.toLocaleString\('en-IN', \{ minimumFractionDigits: 2, maximumFractionDigits: 2 \}\)\}/g;
s = s.replace(walletAmountRe, '{formatInr($1)}');
fs.writeFileSync(p, s, 'utf8');
console.log('fixed encoding and wallet cards');
