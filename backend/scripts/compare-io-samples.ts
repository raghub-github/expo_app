/**
 * Diff two I/O snapshots and print rates. Usage:
 *   npx tsx scripts/compare-io-samples.ts scripts/io-samples/T0.json scripts/io-samples/T5.json
 */
import { readFileSync } from "node:fs";

const BLOCK = 8192;

function load(path: string) {
  const raw = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  return JSON.parse(raw) as Record<string, unknown>;
}

function num(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function row0(snap: Record<string, unknown>, key: string): Record<string, unknown> {
  const block = snap[key] as { ok?: boolean; rows?: Record<string, unknown>[] } | undefined;
  return block?.rows?.[0] ?? {};
}

function rows(snap: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const block = snap[key] as { ok?: boolean; rows?: Record<string, unknown>[] } | undefined;
  return block?.rows ?? [];
}

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(3);
}

function mbs(bytes: number, sec: number): string {
  if (sec <= 0) return "n/a";
  return (bytes / (1024 * 1024) / sec).toFixed(4);
}

const aPath = process.argv[2];
const bPath = process.argv[3];
if (!aPath || !bPath) {
  console.error("usage: npx tsx scripts/compare-io-samples.ts <T0.json> <Tn.json>");
  process.exit(1);
}

const a = load(aPath);
const b = load(bPath);
const t0 = Date.parse(String(a.capturedAt));
const t1 = Date.parse(String(b.capturedAt));
const sec = (t1 - t0) / 1000;

const dbA = row0(a, "db");
const dbB = row0(b, "db");
const walA = row0(a, "wal");
const walB = row0(b, "wal");
const totA = row0(a, "stmtTotals");
const totB = row0(b, "stmtTotals");

const blksRead = num(dbB.blks_read) - num(dbA.blks_read);
const blksHit = num(dbB.blks_hit) - num(dbA.blks_hit);
const tempBytes = num(dbB.temp_bytes) - num(dbA.temp_bytes);
const tempFiles = num(dbB.temp_files) - num(dbA.temp_files);
const walBytes = num(walB.wal_bytes_from_zero) - num(walA.wal_bytes_from_zero);
const tupIns = num(dbB.tup_inserted) - num(dbA.tup_inserted);
const tupUpd = num(dbB.tup_updated) - num(dbA.tup_updated);
const xact = num(dbB.xact_commit) - num(dbA.xact_commit);

console.log(JSON.stringify({
  from: a.capturedAt,
  to: b.capturedAt,
  elapsed_sec: Math.round(sec * 10) / 10,
  disk_read_MB: Number(mb(blksRead * BLOCK)),
  disk_read_MBps: Number(mbs(blksRead * BLOCK, sec)),
  cache_hit_MB: Number(mb(blksHit * BLOCK)),
  temp_MB: Number(mb(tempBytes)),
  temp_MBps: Number(mbs(tempBytes, sec)),
  temp_files: tempFiles,
  wal_MB: Number(mb(walBytes)),
  wal_MBps: Number(mbs(walBytes, sec)),
  tup_inserted: tupIns,
  tup_updated: tupUpd,
  xact_commit: xact,
  stmt_calls: num(totB.calls) - num(totA.calls),
  stmt_shared_blks_read: num(totB.shared_blks_read) - num(totA.shared_blks_read),
  stmt_shared_blks_written: num(totB.shared_blks_written) - num(totA.shared_blks_written),
  stmt_temp_blks_read: num(totB.temp_blks_read) - num(totA.temp_blks_read),
  stmt_temp_blks_written: num(totB.temp_blks_written) - num(totA.temp_blks_written),
  refund: rows(b, "refundInserts")[0] ?? null,
  stuck: rows(b, "stuck"),
  idx: rows(b, "idx")[0] ?? null,
  q123_delta: rows(b, "q123").map((qb) => {
    const qa = rows(a, "q123").find((r) => r.queryid === qb.queryid) ?? {};
    return {
      queryid: qb.queryid,
      calls_delta: num(qb.calls) - num(qa.calls),
      shared_blks_read_delta: num(qb.shared_blks_read) - num(qa.shared_blks_read),
    };
  }),
}, null, 2));
