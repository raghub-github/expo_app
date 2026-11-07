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
const closeBy = Math.floor(Date.now() / 1000) + 15 * 60;

async function tryCreate(label, body) {
  const res = await fetch("https://api.razorpay.com/v1/payments/qr_codes", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  console.log(
    JSON.stringify({
      label,
      status: res.status,
      id: parsed.id,
      image: parsed.image_url,
      err: parsed.error,
      payment_amount: parsed.payment_amount,
      usage: parsed.usage,
      fixed_amount: parsed.fixed_amount,
    })
  );
  return parsed;
}

await tryCreate("multi_fixed_true", {
  type: "upi_qr",
  name: "GatiMitra",
  usage: "multiple_use",
  fixed_amount: true,
  payment_amount: 4100,
  description: "GatiMitra parcel fixed multi",
});

await tryCreate("single_fixed_true_no_close", {
  type: "upi_qr",
  name: "GatiMitra",
  usage: "single_use",
  fixed_amount: true,
  payment_amount: 4100,
  description: "GatiMitra parcel single",
});

await tryCreate("single_fixed_true_with_close", {
  type: "upi_qr",
  name: "GatiMitra",
  usage: "single_use",
  fixed_amount: true,
  payment_amount: 4100,
  description: "GatiMitra parcel single close",
  close_by: closeBy,
});

await tryCreate("single_fixed_true_min_amt", {
  type: "upi_qr",
  usage: "single_use",
  fixed_amount: true,
  payment_amount: 100,
  description: "min amt",
});
