import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

import { acceptOrderForRider } from "../src/modules/rider/rider.orders.service.ts";

const orderRef = process.argv[2] ?? "GM10000074";
const riderId = Number(process.argv[3] ?? "1001");

try {
  const result = await acceptOrderForRider(riderId, orderRef);
  console.log("SUCCESS", JSON.stringify(result, null, 2));
} catch (e) {
  const err = e as Error & { statusCode?: number };
  console.error("FAILED", err.statusCode, err.message, err.stack);
  process.exit(1);
}
