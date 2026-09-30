/**
 * Call listTransactions the same way the API does.
 */
import { listTransactions } from "../src/lib/db/operations/transactions";

async function main() {
  const result = await listTransactions({
    app: "customer",
    page: 1,
    limit: 10,
  });
  for (const r of result.rows) {
    console.log(
      JSON.stringify({
        mode: r.paymentMode,
        amount: r.grossPaise,
        businessOrderId: r.businessOrderId,
        uid: r.uid,
      })
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
