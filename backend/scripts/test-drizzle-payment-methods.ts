import { loadEnv } from "../src/config/loadEnv.js";
import { getDb } from "../src/db/client.js";
import { riderPaymentMethods } from "../src/db/schema.js";
import { and, eq, isNull } from "drizzle-orm";

loadEnv();
const db = getDb();

try {
  const rows = await db
    .select({ id: riderPaymentMethods.id })
    .from(riderPaymentMethods)
    .where(
      and(
        eq(riderPaymentMethods.riderId, 1052),
        eq(riderPaymentMethods.methodType, "bank"),
        isNull(riderPaymentMethods.deletedAt),
      ),
    )
    .limit(1);
  console.log("drizzle ok:", rows);
} catch (err) {
  console.error("drizzle failed:", err);
}
