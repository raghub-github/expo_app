import fs from 'fs';
const p = new URL('../src/app/mx/payments/page.tsx', import.meta.url);
let s = fs.readFileSync(p, 'utf8');
let n = 0;
s = s.replace(/onClick=\{\(\) => \{\}\}/g, () => {
  n += 1;
  if (n === 1 || n === 2) {
    return "type=\"button\" onClick={() => scrollToLedger({ category: 'WITHDRAWAL' })}";
  }
  return 'type="button" onClick={() => void downloadLedgerCsv()}';
});
fs.writeFileSync(p, s, 'utf8');
console.log('replaced', n);
