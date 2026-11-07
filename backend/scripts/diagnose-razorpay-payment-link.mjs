import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function loadEnv(p) {
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const k = m[1].trim();
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(resolve(root, ".env"));
loadEnv(resolve(root, ".env.local"));
const auth = Buffer.from(
  `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
).toString("base64");

const expireBy = Math.floor(Date.now() / 1000) + 30 * 60;
const body = {
  amount: 4100,
  currency: "INR",
  accept_partial: false,
  description: "GatiMitra parcel fare",
  expire_by: expireBy,
  reference_id: `gm_pl_${Date.now()}`.slice(0, 40),
  reminder_enable: false,
  notes: { purpose: "parcel_fare_collect" },
  options: {
    checkout: { method: { upi: true, card: false, netbanking: false, wallet: false } },
  },
};

const res = await fetch("https://api.razorpay.com/v1/payment_links", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});
const text = await res.text();
console.log(JSON.stringify({ status: res.status, body: text.slice(0, 900) }, null, 2));
