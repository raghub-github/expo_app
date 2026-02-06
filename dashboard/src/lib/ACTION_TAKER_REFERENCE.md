# Action taker reference (agent / system / rider)

No **schema or SQL changes** are required for action taker. The following already exist:

- **wallet_ledger**: `performed_by_type`, `performed_by_id` (migration 0066, Drizzle schema).
- **tickets**: `resolved_by` (migration 0080, Drizzle schema).
- **blacklist_history**: `admin_user_id`, `source`, `actor_email`.

Use the patterns below whenever you insert into `wallet_ledger` or update `tickets` so the UI can show "who did it".

---

## 1. Wallet ledger insert – action taker

When inserting into `walletLedger`, always set `performedByType` and `performedById`:

### Agent (dashboard user)

```ts
import { getSystemUserByEmail } from "@/lib/db/get-system-user-by-email";

const systemUser = await getSystemUserByEmail(session.user.email!);

await db.insert(walletLedger).values({
  riderId,
  entryType: "penalty", // or "penalty_reversal", "manual_add", etc.
  amount: amount.toFixed(2),
  balance: balanceAfter,
  serviceType,
  ref,
  refType,
  description,
  performedByType: "agent",
  performedById: systemUser?.id ?? null,
  // ...
});
```

### System (automated / backend logic)

```ts
await db.insert(walletLedger).values({
  riderId,
  entryType: "earning", // or "penalty", "penalty_reversal", etc.
  amount: amount.toFixed(2),
  balance: balanceAfter,
  serviceType,
  ref,
  refType,
  description,
  performedByType: "system",
  performedById: null,
  // ...
});
```

### Rider (rider app / self-service)

```ts
await db.insert(walletLedger).values({
  riderId,
  entryType: "manual_add", // or other rider-initiated type
  amount: amount.toFixed(2),
  balance: balanceAfter,
  serviceType,
  ref,
  refType,
  description,
  performedByType: "rider",
  performedById: null,
  // ...
});
```

### Optional: automated (cron / job)

```ts
  performedByType: "automated",
  performedById: null,
```

---

## 2. Tickets – resolved by (agent)

When resolving/closing a ticket, set `resolved_by` to the current agent:

```ts
await db
  .update(tickets)
  .set({
    status: "resolved",
    resolvedAt: new Date(),
    resolutionNotes,
    resolvedBy: systemUser?.id ?? null,
  })
  .where(eq(tickets.id, ticketId));
```

---

## 3. Allowed values for `performed_by_type`

- `"agent"` – dashboard user; set `performed_by_id` to `system_users.id`.
- `"system"` – backend/automated logic; `performed_by_id` = null.
- `"rider"` – rider app / self-service; `performed_by_id` = null.
- `"automated"` – cron/jobs; `performed_by_id` = null.

API and UI already read these and show "Agent (name/email)", "System", or "Rider" in the wallet history and ticket details.
