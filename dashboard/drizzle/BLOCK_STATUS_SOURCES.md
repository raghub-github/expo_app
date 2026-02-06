# Block status: two sources

## Critical: single source of truth for wallet updates (0077, 0079)

**Penalty apply:** The **dashboard app** is the single source of truth. It inserts `rider_penalties` and `wallet_ledger` (entry_type = penalty, service_type = food/parcel/person_ride), then **updates `rider_wallet`** (penalties_* += amount for that service, total_balance -= amount). The **wallet_ledger trigger** does **not** update `rider_wallet` for `penalty` (0077), so the penalty is applied once per service.

**Penalty revert:** App inserts `wallet_ledger` (entry_type = penalty_reversal + service_type), then **updates `rider_wallet`** (decrease that service’s penalty, increase total). The ledger trigger skips `penalty_reversal` (0077).

**Generic add balance (top-up):** The ledger trigger **skips** `manual_add` when `service_type` is NULL (0079). The app uses **POST `/api/riders/[id]/wallet/add-balance`** to insert ledger, update `rider_wallet.total_balance`, run **FIFO allocation** (unblock_alloc_*), and sync blocks.

---

## 1. Agent blacklist (`blacklist_history` / view `blacklist_current_status`)

- **Written by:** Dashboard blacklist/whitelist API only (`POST /api/riders/[id]/blacklist`).
- **Not updated by:** Penalty, penalty revert, or wallet adjustment.
- **Purpose:** Agent-imposed ban/allow per service (food, parcel, person_ride, all).

So **blacklist_current_status does not change when you revert a penalty or add amount** — that is by design. Wallet-driven blocks use the other source below.

## 2. Negative wallet blocks (`rider_negative_wallet_blocks`)

- **Written by:** Trigger `sync_rider_negative_wallet_blocks_from_wallet()` on `rider_wallet` (after every INSERT/UPDATE on `rider_wallet`).
- **Updated when:** `rider_wallet` changes (penalty apply, penalty revert, refund/penalty_reversal/manual_add with service_type via `wallet_ledger` trigger; generic manual_add via app POST `/api/riders/[id]/wallet/add-balance` which updates wallet + FIFO allocation + sync).
- **Purpose (0078, 0079):**
  - **Global block:** When `total_balance ≤ -200`, **all** services are blocked (reason `global_emergency`). Unlock only when `total_balance ≥ 0`.
  - **Per-service block:** When `total_balance > -200`, block a service when **effective_net** = (earnings − penalties + unblock_alloc) for that service **≤ -50** (reason `negative_wallet`). No block when effective_net &gt; -50. Block is removed when effective_net &gt; -50 or (for global) when total_balance ≥ 0.
- **FIFO unblock:** Generic credit (manual_add without service_type) is applied by the app: it updates `total_balance`, then allocates the amount in **block order** (first blocked → first unblocked) into `unblock_alloc_food/parcel/person_ride`, then the trigger re-runs. So the first blocked service gets “credit” first until its effective_net &gt; -50, then the next, etc.

So **rider_negative_wallet_blocks** is the table that should update after wallet adjustment. The dashboard summary API returns:
- `blacklistStatusByService` (from `blacklist_history` / agent)
- `negativeWalletBlocks` (from `rider_negative_wallet_blocks`), with optional `blockReason: 'global' | 'service'`
- `wallet.globalWalletBlock` (true when total_balance ≤ -200)

The UI shows a service as blocked if **either** agent blacklist or negative-wallet block applies.

## Why multiple services can show blocked after one penalty

The trigger syncs **current** state from `rider_wallet`: for each service it does “if net &lt; 0 then ensure block row exists, else delete block row”. So:

- Penalizing **only Food** only changes `penalties_food`; Food’s net can go negative and get a block.
- If **Parcel** (or Person ride) already had net &lt; 0 from earlier penalties, they already have a block row; the same trigger run keeps them blocked.
- So “blocking multiple services” after one penalty usually means: one service just went negative (this penalty), others were already negative (previous penalties). The trigger does not “copy” the penalty to other services; it only reflects current per-service net.

## Fixing existing wrong blocks (one-time)

If `rider_negative_wallet_blocks` has extra rows (e.g. all three services blocked when only one was penalized), force the trigger to re-run so blocks are replaced from current `rider_wallet`:

```sql
UPDATE rider_wallet SET last_updated_at = NOW() WHERE rider_id = 1003;
```

The trigger will delete all blocks for that rider and insert only for services where net &lt; 0.

## Ensuring blocks update after wallet changes

1. **Revert penalty:** Revert route inserts `wallet_ledger` (entry_type = **penalty_reversal** + `service_type`). App updates `rider_wallet` (decrease that service’s penalty, increase total). Then app calls sync (or trigger runs on wallet UPDATE) and removes the block for that service when effective_net &gt; -50.
2. **Add amount (service-specific):** Insert `wallet_ledger` with `entry_type = 'manual_add'` and `service_type` set. The ledger trigger increases that service’s **earnings** and total; the block trigger then runs and can remove the block when effective_net &gt; -50.
3. **Add amount (generic / top-up):** Use **POST `/api/riders/[id]/wallet/add-balance`**. The ledger trigger **skips** `manual_add` when `service_type` is NULL (0079). The app inserts ledger, updates `rider_wallet.total_balance`, runs **FIFO allocation** (updates `unblock_alloc_*`), and sync runs so blocks follow effective_net and global rule.
4. **Partitioned `wallet_ledger`:** The ledger trigger must be on the **parent** `public.wallet_ledger` (0075 / 0076) so every insert (including into partitions) runs the wallet update and thus block sync.

## Migrations 0076, 0077, 0078, 0079

- **0076** re-applies the block trigger and runs a one-time repair to recompute blocks from current wallet.
- **0077** makes the dashboard app the single source of truth for **penalty** and **penalty_reversal**: the ledger trigger no longer updates `rider_wallet` for those two (the app updates only the relevant service column).
- **0078** sets service block threshold to **≤ -50** (effective_net; -49 or higher = no block).
- **0079** adds **global block** (total_balance ≤ -200 → block all, reason `global_emergency`; unlock when total_balance ≥ 0), **unblock_alloc_*** columns for FIFO, **effective_net** = (earnings − penalties + unblock_alloc), and ledger trigger **skips generic manual_add** (no service_type); app handles generic add via add-balance API + FIFO.
