# Rider Blacklisting / Whitelisting Logic — Technical Design

## 1. Architecture Design

### Recommendation: **Ledger-driven, event-driven, with app-layer blocking engine**

- **Wallet-driven**: Yes. Single source of truth is `total_balance` derived from ledger; `rider_wallet` is a materialized view of balance + service-level aggregates.
- **Event-driven**: Every financial event (penalty, penalty_revert, earning, manual_add, withdrawal) writes to `wallet_ledger` first (or updates wallet and ledger in same transaction), then triggers **recalculation** of:
  - `total_balance` (and per-service penalty/earning aggregates where needed)
  - **Service-level negative contribution** (`negative_used_food`, `negative_used_parcel`, `negative_used_person_ride`)
  - **Blocking state** (`rider_negative_wallet_blocks`).
- **Trigger-based**: Prefer **application-layer** recalculation after each wallet-mutating API call (penalty, revert, add-balance, credit-approve) so that:
  - Logic lives in one place (TypeScript), is testable, and avoids trigger/function drift between DB and app.
  - Optional: a **DB trigger** on `wallet_ledger` or `rider_wallet` can call a stored procedure to recompute `negative_used_*` and sync blocks for consistency if other writers (e.g. batch jobs) update the wallet.
- **Ledger-based**: All balance changes go through `wallet_ledger`. Balance is never updated without a corresponding ledger row. This gives auditability and rollback capability.

**Safest approach**: Ledger as source of truth; app performs wallet update + ledger insert in a single transaction, then runs the blocking engine (recompute `negative_used_*` for the affected rider and sync `rider_negative_wallet_blocks`). No double penalty without ledger row; no blocking without going through this path.

---

## 2. Database Schema (Existing + Additions)

### 2.1 Existing Tables Used

| Table | Role |
|-------|------|
| **rider_wallet** | Current balance, per-service earnings/penalties, unblock_alloc_*, (new) negative_used_* |
| **wallet_ledger** | Immutable log: entry_type, amount, balance, service_type, ref, ref_type |
| **rider_penalties** | Penalty rows with service_type, amount, status (active/reversed) |
| **rider_negative_wallet_blocks** | One row per (rider_id, service_type) when blocked; reason = 'negative_wallet' \| 'global_emergency' |

### 2.2 New Columns on rider_wallet

| Column | Type | Purpose |
|--------|------|---------|
| **negative_used_food** | numeric(10,2) DEFAULT 0 | Amount of negative balance attributed to Food (for -50 threshold). Only incremented when wallet is or goes negative. |
| **negative_used_parcel** | numeric(10,2) DEFAULT 0 | Same for Parcel. |
| **negative_used_person_ride** | numeric(10,2) DEFAULT 0 | Same for Person Ride. |

**Semantics**: When a penalty is applied and the wallet goes negative (or further negative), the “negative portion” attributed to that penalty’s service is added to the corresponding `negative_used_*`. When `total_balance >= 0`, all three are reset to 0 (and all blocks cleared). Blocking uses **effective_negative = negative_used_* - unblock_alloc_***; block service when effective_negative > 50. Global block when total_balance <= -200.

### 2.3 Wallet Table (logical)

- **total_balance**: Single source of truth for “can withdraw / global block”.
- **earnings_*** / **penalties_***: Audit/display; blocking uses **negative_used_*** and **unblock_alloc_***.
- **unblock_alloc_***: Generic credit (e.g. manual add) allocated FIFO to offset negative_used_* so that effective_negative = negative_used_* - unblock_alloc_*.

### 2.4 Blocking Table

- **rider_negative_wallet_blocks**: (rider_id, service_type) unique; reason = 'negative_wallet' (per-service -50) or 'global_emergency' (total <= -200). No booleans scattered elsewhere; this table is the blocking state.

### 2.5 Constraints and Indexes

- rider_wallet: CHECK (total_balance, negative_used_* can be negative); index on total_balance for “global block” queries.
- rider_negative_wallet_blocks: unique (rider_id, service_type); index (rider_id).
- wallet_ledger: composite PK (id, rider_id); indexes on (rider_id, created_at), (rider_id, service_type), ref.

---

## 3. Correct Blocking Rules (Implementation)

### RULE 1 — Positive wallet protection

- If **total_balance >= 0 after** a penalty (or any event): do **not** block any service; do **not** increment threshold counters. Only deduct. Positive wallet is a buffer.

### RULE 2 — Threshold only after negative

- Each service has a **negative threshold limit = 50** (i.e. “allowed negative” = 50).
- **negative_used_*** = amount of current negative balance attributed to that service (only counted after wallet is or goes negative).
- **effective_negative = negative_used_* - unblock_alloc_***.
- Block **that service** when effective_negative **> 50**. Other services remain unblocked if their effective_negative <= 50.

**Example**: Wallet 100 → Penalty Food 90 → balance 10 → no block, no negative_used. Penalty Parcel 30 → balance -20 → parcel negative_used += 20; 20 <= 50 → no block. Penalty Food 100 → balance -120 → food negative_used += 100 → 100 > 50 → block Food only; Parcel still 20 → unblocked.

### RULE 3 — Extreme negative (global block)

- If **total_balance <= -200**: insert blocks for **all** services with reason `global_emergency`. When **total_balance >= 0** again, remove all blocks and reset negative_used_* (and optionally unblock_alloc_*) to 0.

### RULE 4 — Auto unblock

- On: add money, earning, penalty revert — recalculate negative_used_* (or reset when balance >= 0), apply FIFO for generic credit, then **sync** rider_negative_wallet_blocks. No manual review.

### RULE 5 — Service-level negative tracking

- Do **not** block using only total balance. Use **negative_used_food**, **negative_used_parcel**, **negative_used_person_ride** so that only the service that exceeded -50 is blocked.

---

## 4. Transaction Safety

- **Double penalty**: Each penalty insert is one row in `rider_penalties` and one in `wallet_ledger` with ref = `pen_<id>`. Idempotency by (ref) if needed.
- **Race conditions**: All wallet updates for a given rider in a **single transaction** (read wallet → compute new balance and negative_used deltas → update rider_wallet → insert ledger → sync blocks). Use **SELECT ... FOR UPDATE** on `rider_wallet` where rider_id = ? in the same transaction to serialize concurrent updates for that rider.
- **Isolation**: Use **READ COMMITTED** or **REPEATABLE READ** for the wallet update transaction; FOR UPDATE prevents lost updates.
- **Negative calculation bugs**: negative_used_* is updated only in the same code path that updates total_balance (penalty, revert, add-balance); formula is explicit (see “On penalty” below).

---

## 5. Blocking Engine Statuses

- **ACTIVE**: No row in rider_negative_wallet_blocks for that service (and total_balance > -200).
- **LIMIT_WARNING**: Optional; when effective_negative in (40, 50] for a service — can be derived in API/UI, not stored.
- **BLOCKED_SERVICE**: Row exists with reason `negative_wallet` (effective_negative > 50 for that service).
- **BLOCKED_ALL**: total_balance <= -200; rows for all services with reason `global_emergency`.

Do not scatter booleans; use rider_negative_wallet_blocks as the single blocking state.

---

## 6. Auto-Recalculation Engine

- **When**: After every penalty impose, penalty revert, add-balance, wallet credit approval, and (if applicable) earning credit.
- **How**: In the same request, after updating rider_wallet and wallet_ledger:
  1. **Penalty impose**: Compute delta for negative_used for this service (see below); update rider_wallet; sync blocks.
  2. **Penalty revert / Add balance / Credit**: If new total_balance >= 0: set negative_used_* = 0, unblock_alloc_* = 0; else (revert) reduce this service’s negative_used by amount (cap 0), or (add balance) run FIFO to increase unblock_alloc_*. Then sync blocks.
- **Event queue**: Optional later; for now synchronous recalculation in the API is sufficient and avoids eventual consistency issues. Kafka-style stream only if you need to offload heavy work or fan-out to other systems.

---

## 7. Edge Cases

| Scenario | Handling |
|----------|----------|
| Wallet jumps +300 → -250 in one penalty | One penalty: new_balance = 300 - 250 = 50 (positive). No block, no negative_used. If penalty were 400: new_balance = -100; negative_used for that service += 100; block if 100 > 50. |
| Multiple penalties same second | Process in one transaction with FOR UPDATE; apply penalties in order; each step uses current balance and updates negative_used for that service. |
| Penalty reversal after blocking | Revert adds credit to balance and reduces that service’s penalty aggregate; also reduce that service’s negative_used by reverted amount (cap 0). Re-sync blocks; may unblock that service. |
| Rider earns while blocked | Earning increases total_balance and earnings_*; if total_balance >= 0, reset negative_used and unblock all; else no change to negative_used (earning is positive); blocks stay until credit or revert brings effective_negative down. |
| Service switching | negative_used is per service; blocking is per service. No special case. |
| Manual adjustment | Treated like “add balance” or a credit: increase total_balance; if >= 0 reset negative_used and unblock; else FIFO to unblock_alloc_* and sync. |

---

## 8. Fraud Prevention

- **Sudden penalty spike**: Alert or flag when e.g. sum of penalties in last 1h for a rider > threshold.
- **Abuse flags**: Store in rider or wallet metadata; block/freeze via existing is_frozen and blacklist.
- **Temporary freeze**: rider_wallet.is_frozen; do not allow withdrawal or (optionally) new orders until reviewed.
- **Admin alerts**: On global_emergency block (total <= -200) or when a service is first blocked, emit event for dashboard/audit.

---

## 9. Performance and Scaling

- **Indexes**: rider_wallet (rider_id unique, total_balance); rider_negative_wallet_blocks (rider_id, service_type unique); wallet_ledger (rider_id, created_at).
- **Locking**: Only lock the row for the rider being updated (FOR UPDATE on rider_wallet where rider_id = ?). No full-table locks.
- **Throughput**: One transaction per rider per event; scale by sharding riders or partitioning ledger by rider_id if needed.

---

## 10. Migration Strategy (Old → New)

1. **Add columns**: negative_used_food, negative_used_parcel, negative_used_person_ride DEFAULT 0 on rider_wallet.
2. **Backfill**: For each rider with total_balance < 0, compute negative_used_* from **penalty history** (ordered by imposed_at): simulate “consuming positive first”, then attribute negative to each penalty’s service. This is non-trivial; alternative: set negative_used_* = 0 and run a one-time “recompute from ledger” job that replays ledger entries and rebuilds negative_used_* and then syncs blocks.
3. **Recompute blocks**: After backfill, run sync_negative_wallet_blocks for all affected riders so rider_negative_wallet_blocks matches new logic.
4. **Avoid mass blocking**: Backfill should produce negative_used_* <= current “effective” negative per service (so we don’t over-block). Prefer replay from ledger so logic is identical to app.

---

## 11. Common Mistakes to Avoid

- **Updating balance without ledger**: Every balance change must have a ledger row.
- **No transaction**: Wallet + ledger + blocks must be updated in one transaction (or strict ordering with FOR UPDATE).
- **Blocking on total_balance only**: Must use per-service negative_used so only the service that exceeded -50 is blocked.
- **Starting threshold before negative**: Do not increment negative_used when balance is still >= 0 after the penalty.
- **Scattering block state**: Keep blocking only in rider_negative_wallet_blocks; do not add “is_blocked” on rider_wallet or riders.
- **Ignoring revert**: Penalty revert must decrease negative_used for that service and re-sync blocks.

---

## 12. Formula Reference

**On penalty (amount, service)**:
- new_balance = old_balance - amount  
- If new_balance >= 0: do not change negative_used_* (positive buffer consumed).  
- If new_balance < 0:  
  - If old_balance >= 0: this_service negative_used += (amount - old_balance)  
  - If old_balance < 0: this_service negative_used += amount  

**Blocking**:
- If total_balance > 0: remove all blocks; set negative_used_* = 0 (and unblock_alloc_* = 0).  
- If total_balance <= -200: block all services, reason = global_emergency.  
- Else: for each service, effective_negative = negative_used_* - unblock_alloc_*; block if effective_negative > 50, reason = negative_wallet.

**On credit (add balance / revert)**:
- new_balance = old_balance + amount  
- If new_balance >= 0: set all negative_used_* = 0, all unblock_alloc_* = 0; remove all blocks.  
- If new_balance < 0 (revert): reduce this_service negative_used by amount (cap 0); then sync blocks.  
- If new_balance < 0 (generic add): apply FIFO to unblock_alloc_* (increase allocation to reduce effective_negative); then sync blocks.
