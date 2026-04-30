/**
 * Unit tests for enqueuePlacementNotifications.
 *
 * We don't hit Postgres here — the helper is thin enough that we can assert on
 * the Drizzle insert call shape with a stub tx. The goal is to lock in:
 *   - exactly 3 rows are queued (merchant, rider_dispatch, customer),
 *   - the right recipient/channel/event wiring per audience,
 *   - the payload is shared and carries the essentials for downstream workers,
 *   - nothing throws when optional ids (merchantStoreId / customerId) are null.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { orderNotifications } from "../../db/schema.js";
import { enqueuePlacementNotifications } from "./orderNotifications.js";

type InsertCall = { table: unknown; values: Array<Record<string, unknown>> };

function makeStubTx(): { tx: PostgresJsDatabase<Record<string, unknown>>; calls: InsertCall[] } {
  const calls: InsertCall[] = [];
  const tx = {
    insert: (table: unknown) => ({
      values: async (rows: Array<Record<string, unknown>>) => {
        calls.push({ table, values: rows });
      },
    }),
  } as unknown as PostgresJsDatabase<Record<string, unknown>>;
  return { tx, calls };
}

describe("enqueuePlacementNotifications", () => {
  it("queues one row each for merchant, rider_dispatch, customer with correct wiring", async () => {
    const { tx, calls } = makeStubTx();

    await enqueuePlacementNotifications(tx, {
      orderId: "ord_123",
      customerId: 42,
      merchantStoreId: 99,
      merchantParentId: 7,
      grandTotal: 342.5,
      itemCount: 3,
      orderCode: "ORD-123",
      summary: "3 items • ₹342.50",
    });

    assert.equal(calls.length, 1, "should be a single batch insert");
    assert.equal(calls[0].table, orderNotifications);

    const rows = calls[0].values;
    assert.equal(rows.length, 3);

    const byAudience = Object.fromEntries(rows.map((r) => [r.audience as string, r]));
    assert.ok(byAudience.merchant && byAudience.rider_dispatch && byAudience.customer);

    assert.equal(byAudience.merchant.channel, "realtime");
    assert.equal(byAudience.merchant.eventType, "ORDER_PLACED");
    assert.equal(byAudience.merchant.recipientType, "merchant_store");
    assert.equal(byAudience.merchant.recipientId, "99");

    assert.equal(byAudience.rider_dispatch.channel, "internal");
    assert.equal(byAudience.rider_dispatch.eventType, "ORDER_READY_FOR_DISPATCH");
    assert.equal(byAudience.rider_dispatch.recipientType, "rider_pool");
    assert.equal(byAudience.rider_dispatch.recipientId, "store:99");

    assert.equal(byAudience.customer.channel, "realtime");
    assert.equal(byAudience.customer.eventType, "ORDER_PLACED");
    assert.equal(byAudience.customer.recipientType, "customer");
    assert.equal(byAudience.customer.recipientId, "42");

    for (const row of rows) {
      assert.equal(row.orderId, "ord_123");
      assert.equal(row.status, "pending");
      const payload = row.payload as Record<string, unknown>;
      assert.equal(payload.orderId, "ord_123");
      assert.equal(payload.orderCode, "ORD-123");
      assert.equal(payload.grandTotal, 342.5);
      assert.equal(payload.itemCount, 3);
      assert.equal(payload.merchantStoreId, 99);
      assert.equal(payload.customerId, 42);
    }
  });

  it("handles null merchantStoreId and customerId without throwing", async () => {
    const { tx, calls } = makeStubTx();

    await enqueuePlacementNotifications(tx, {
      orderId: "ord_nil",
      customerId: null,
      merchantStoreId: null,
      merchantParentId: null,
      grandTotal: 100,
      itemCount: 1,
    });

    const rows = calls[0].values;
    assert.equal(rows.length, 3);
    const byAudience = Object.fromEntries(rows.map((r) => [r.audience as string, r]));
    // undefined (not an empty string) so the DB column stays NULL
    assert.equal(byAudience.merchant.recipientId, undefined);
    assert.equal(byAudience.rider_dispatch.recipientId, undefined);
    assert.equal(byAudience.customer.recipientId, undefined);
  });
});
