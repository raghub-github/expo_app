/**
 * Verifies the production create path: single_use first, then multiple_use fallback.
 * Does not print secrets. Closes any QR it creates.
 */
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

async function post(body) {
  const res = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: JSON.parse(await res.text()) };
}

async function close(id) {
  const res = await fetch(
    `https://api.razorpay.com/v1/payments/qr_codes/${id}/close`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
    }
  );
  return res.status;
}

const amountPaise = 4100;
const closeBy = Math.floor(Date.now() / 1000) + 15 * 60;
const base = {
  type: "upi_qr",
  name: "GatiMitra Parcel",
  fixed_amount: true,
  payment_amount: amountPaise,
  description: "GatiMitra parcel verify_fix",
  notes: { purpose: "parcel_fare_collect", orderRef: `verify_${Date.now()}` },
};

const single = await post({ ...base, usage: "single_use", close_by: closeBy });
console.log(
  JSON.stringify({
    step: "single_use",
    status: single.status,
    code: single.json?.error?.code,
    id: single.json?.id,
  })
);

let created = null;
if (single.status >= 200 && single.status < 300) {
  created = { usage: "single_use", ...single.json };
} else {
  const multi = await post({ ...base, usage: "multiple_use" });
  console.log(
    JSON.stringify({
      step: "multiple_use_fallback",
      status: multi.status,
      id: multi.json?.id,
      image_url: multi.json?.image_url,
      payment_amount: multi.json?.payment_amount,
      fixed_amount: multi.json?.fixed_amount,
    })
  );
  if (multi.status >= 200 && multi.status < 300) {
    created = { usage: "multiple_use", ...multi.json };
  }
}

if (!created?.id) {
  console.log(JSON.stringify({ ok: false, reason: "create_failed" }));
  process.exit(1);
}

const closeStatus = await close(created.id);
console.log(
  JSON.stringify({
    ok: true,
    usage: created.usage,
    qrId: created.id,
    payment_amount_paise: created.payment_amount,
    image_url: Boolean(created.image_url),
    closeStatus,
  })
);
