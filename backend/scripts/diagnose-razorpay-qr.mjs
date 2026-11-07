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
    ) {
      v = v.slice(1, -1);
    }
    if (!(k in process.env)) process.env[k] = v;
  }
}

loadEnv(resolve(root, ".env"));
loadEnv(resolve(root, ".env.local"));

const keyId = process.env.RAZORPAY_KEY_ID || "";
const secret = process.env.RAZORPAY_KEY_SECRET || "";
const mode = keyId.startsWith("rzp_test_")
  ? "TEST"
  : keyId.startsWith("rzp_live_")
    ? "LIVE"
    : "UNKNOWN";

console.log(
  JSON.stringify({
    mode,
    keyIdLen: keyId.length,
    secretSet: Boolean(secret),
    dummy: process.env.PAYMENT_DUMMY_MODE,
  })
);

const auth = Buffer.from(`${keyId}:${secret}`).toString("base64");
const closeBy = Math.floor(Date.now() / 1000) + 15 * 60;
const body = {
  type: "upi_qr",
  name: "GatiMitra Parcel",
  usage: "single_use",
  fixed_amount: true,
  payment_amount: 4100,
  description: "GatiMitra parcel diagnose",
  close_by: closeBy,
  notes: {
    purpose: "parcel_fare_collect",
    orderRef: `diag_${Date.now()}`,
  },
};

const res = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "content-type": "application/json",
  },
  body: JSON.stringify(body),
});
const text = await res.text();
const headers = {};
for (const [k, v] of res.headers.entries()) {
  if (/razorpay|request|correlation|ratelimit|cf-|x-/i.test(k)) headers[k] = v;
}
console.log(
  JSON.stringify(
    {
      httpStatus: res.status,
      statusText: res.statusText,
      headers,
      body: text.slice(0, 1200),
    },
    null,
    2
  )
);

// Also probe whether credentials work at all (orders API is baseline).
const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    amount: 4100,
    currency: "INR",
    receipt: `diag_${Date.now()}`.slice(0, 40),
  }),
});
const orderText = await orderRes.text();
console.log(
  JSON.stringify(
    {
      probe: "orders_create",
      httpStatus: orderRes.status,
      body: orderText.slice(0, 400),
    },
    null,
    2
  )
);
