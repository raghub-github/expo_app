import fs from 'fs';
const p = new URL('../src/components/payments/PaymentsOverviewCharts.tsx', import.meta.url);
let lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
// Find "Recent Payout" section start and remove until closing grid
const start = lines.findIndex((l) => l.includes('Recent Payout'));
if (start > 0) {
  // back up to opening div of recent card (line before h3 block)
  let i = start;
  while (i > 0 && !lines[i].includes('<motion.div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 flex flex-col">') && !lines[i].trim().startsWith('<div className="bg-white rounded-lg')) i--;
  if (lines[i].includes('lg:col-span-2')) {
    // wrong div - search for standalone recent card
    i = start - 2;
    while (i > 0 && !lines[i].trim().startsWith('<div')) i--;
  }
  const cardStart = lines.findIndex((l, idx) => idx < start && l.trim() === '<div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 flex flex-col">');
  const end = lines.findIndex((l, idx) => idx > cardStart && l.trim() === '</div>' && lines[idx + 1]?.trim() === '</motion.div>');
  // simpler: delete from line containing only recent card opening
  const rs = lines.findIndex((l) => l.includes('Recent Payout')) - 2;
  let re = rs;
  let depth = 0;
  for (let j = rs; j < lines.length; j++) {
    if (lines[j].includes('<div')) depth++;
    if (lines[j].includes('</div>')) depth--;
    if (depth === 0 && j > rs) {
      re = j;
      break;
    }
  }
  lines.splice(rs, re - rs + 1);
}

let s = lines.join('\n');
s = s.replace(/<motion\.div/g, '<div').replace(/<\/motion\.motion.div>/g, '</div>');
s = s.replace(/recentPayouts\.length/g, 'false');
s = s.replace(
          `<div className="flex-1 space-y-2">
            {(
              [
                ['Paid', payoutSummary.paid, 'bg-emerald-500'],
                ['In Process', payoutSummary.in_process, 'bg-orange-500'],
                ['Pending', payoutSummary.pending, 'bg-red-500'],
                ['Failed', payoutSummary.failed, 'bg-purple-500'],
              ] as const
            ).map(([label, amt, dot]) => (
              <div key={label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div className={\`w-2.5 h-2.5 rounded-full \${dot}\`} />
                  <span className="text-xs text-gray-600 font-medium">{label}</span>
                </div>
                <span className="text-xs font-semibold text-gray-900">{formatInr(amt)}</span>
              </div>
            ))}
          </motion.div>`,
  `<div className="flex-1 w-full max-w-md space-y-3 sm:pt-2">
            {(
              [
                ['Paid', payoutSummary.paid, 'bg-emerald-500'],
                ['In Process', payoutSummary.in_process, 'bg-orange-500'],
                ['Pending', payoutSummary.pending, 'bg-red-500'],
                ['Failed', payoutSummary.failed, 'bg-purple-500'],
              ] as const
            ).map(([label, amt, dot]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className={\`w-3 h-3 rounded-full \${dot}\`} />
                  <span className="text-sm text-gray-700 font-medium">{label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatInr(amt)}</span>
              </div>
            ))}
          </motion.div>`
);

fs.writeFileSync(p, s, 'utf8');
console.log('patched');
