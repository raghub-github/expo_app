/**
 * Diff statement and table I/O between two snapshots.
 *   npx tsx scripts/diff-io-hotspots.ts scripts/io-samples/T0.json scripts/io-samples/T5.json
 */
import { readFileSync } from "node:fs";

function load(path: string) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as Record<string, unknown>;
}
function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function rows(snap: Record<string, unknown>, key: string): Record<string, unknown>[] {
  return ((snap[key] as { rows?: Record<string, unknown>[] } | undefined)?.rows) ?? [];
}

const a = load(process.argv[2]!);
const b = load(process.argv[3]!);
const sec = (Date.parse(String(b.capturedAt)) - Date.parse(String(a.capturedAt))) / 1000;

function indexBy(list: Record<string, unknown>[], k: string) {
  const m = new Map<string, Record<string, unknown>>();
  for (const r of list) m.set(String(r[k]), r);
  return m;
}

const stmtKeys = ["stmtsByShared", "stmtsByRead", "stmtsByWrite", "stmtsByCalls", "stmtsByTemp"] as const;
const stmtMapA = new Map<string, Record<string, unknown>>();
const stmtMapB = new Map<string, Record<string, unknown>>();
for (const k of stmtKeys) {
  for (const r of rows(a, k)) stmtMapA.set(String(r.queryid), r);
  for (const r of rows(b, k)) stmtMapB.set(String(r.queryid), r);
}

const stmtDeltas = [...stmtMapB.entries()].map(([id, rb]) => {
  const ra = stmtMapA.get(id) ?? {};
  const calls = num(rb.calls) - num(ra.calls);
  const reads = num(rb.shared_blks_read) - num(ra.shared_blks_read);
  const writes = num(rb.shared_blks_written) - num(ra.shared_blks_written);
  const temp = (num(rb.temp_blks_read) - num(ra.temp_blks_read)) + (num(rb.temp_blks_written) - num(ra.temp_blks_written));
  return {
    queryid: id,
    calls,
    calls_per_min: sec > 0 ? Math.round((calls / sec) * 60 * 10) / 10 : 0,
    shared_blks_read: reads,
    shared_blks_written: writes,
    temp_blks: temp,
    read_MB: Math.round((reads * 8192) / (1024 * 1024) * 1000) / 1000,
    query: String(rb.query ?? "").replace(/\s+/g, " ").slice(0, 160),
  };
}).filter((d) => d.calls !== 0 || d.shared_blks_read !== 0 || d.temp_blks !== 0);

const byRead = [...stmtDeltas].sort((x, y) => y.shared_blks_read - x.shared_blks_read).slice(0, 15);
const byCalls = [...stmtDeltas].sort((x, y) => y.calls - x.calls).slice(0, 15);
const byTemp = [...stmtDeltas].sort((x, y) => y.temp_blks - x.temp_blks).slice(0, 10);

const tablesA = indexBy(rows(a, "tables"), "relname");
const tableDeltas = rows(b, "tables").map((rb) => {
  const ra = tablesA.get(String(rb.relname)) ?? {};
  const heap = num(rb.heap_blks_read) - num(ra.heap_blks_read);
  const idx = num(rb.idx_blks_read) - num(ra.idx_blks_read);
  return {
    relname: rb.relname,
    heap_blks_read: heap,
    idx_blks_read: idx,
    total_read_MB: Math.round(((heap + idx) * 8192) / (1024 * 1024) * 1000) / 1000,
    seq_scan: num(rb.seq_scan) - num(ra.seq_scan),
    seq_tup_read: num(rb.seq_tup_read) - num(ra.seq_tup_read),
    idx_scan: num(rb.idx_scan) - num(ra.idx_scan),
    n_tup_ins: num(rb.n_tup_ins) - num(ra.n_tup_ins),
    n_tup_upd: num(rb.n_tup_upd) - num(ra.n_tup_upd),
    n_dead_tup: num(rb.n_dead_tup),
    n_live_tup: num(rb.n_live_tup),
  };
}).sort((x, y) => y.total_read_MB - x.total_read_MB).slice(0, 15);

const ioA = indexBy(rows(a, "io"), "backend_type");
// pg_stat_io has multiple rows per backend_type; sum reads/writes
function sumIo(snap: Record<string, unknown>) {
  const out: Record<string, { reads: number; writes: number; read_MB: number; write_MB: number }> = {};
  for (const r of rows(snap, "io")) {
    const k = `${r.backend_type}|${r.object}|${r.context}`;
    const op = num(r.op_bytes) || 8192;
    if (!out[k]) out[k] = { reads: 0, writes: 0, read_MB: 0, write_MB: 0 };
    out[k].reads += num(r.reads);
    out[k].writes += num(r.writes);
    out[k].read_MB += (num(r.reads) * op) / (1024 * 1024);
    out[k].write_MB += (num(r.writes) * op) / (1024 * 1024);
  }
  return out;
}
const ioSumA = sumIo(a);
const ioSumB = sumIo(b);
const ioDelta = Object.keys(ioSumB).map((k) => {
  const A = ioSumA[k] ?? { reads: 0, writes: 0, read_MB: 0, write_MB: 0 };
  const B = ioSumB[k];
  return {
    key: k,
    reads: B.reads - A.reads,
    writes: B.writes - A.writes,
    read_MB: Math.round((B.read_MB - A.read_MB) * 1000) / 1000,
    write_MB: Math.round((B.write_MB - A.write_MB) * 1000) / 1000,
  };
}).filter((d) => d.reads || d.writes).sort((x, y) => (y.read_MB + y.write_MB) - (x.read_MB + x.write_MB)).slice(0, 12);

console.log(JSON.stringify({
  elapsed_sec: Math.round(sec * 10) / 10,
  top_stmt_by_read: byRead,
  top_stmt_by_calls: byCalls,
  top_stmt_by_temp: byTemp,
  top_tables: tableDeltas,
  pg_stat_io_delta: ioDelta,
}, null, 2));
