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

const keyId = process.env.RAZORPAY_KEY_ID || "";
const secret = process.env.RAZORPAY_KEY_SECRET || "";
const auth = Buffer.from(`${keyId}:${secret}`).toString("base64");
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
  console.log(
    JSON.stringify({
      label,
      status: res.status,
      body: text.slice(0, 350),
    })
  );
}

await tryCreate("minimal_single_use", {
  type: "upi_qr",
  usage: "single_use",
  fixed_amount: true,
  payment_amount: 4100,
  description: "diag minimal",
});

await tryCreate("with_name_close_by", {
  type: "upi_qr",
  name: "GatiMitra",
  usage: "single_use",
  fixed_amount: true,
  payment_amount: 4100,
  description: "diag named",
  close_by: closeBy,
});

await tryCreate("multiple_use_any_amount", {
  type: "upi_qr",
  usage: "multiple_use",
  fixed_amount: false,
  description: "diag multi",
});

await tryCreate("bharat_qr", {
  type: "bharat_qr",
  usage: "single_use",
  fixed_amount: true,
  payment_amount: 4100,
  description: "diag bharat",
});

const listRes = await fetch(
  "https://api.razorpay.com/v1/payments/qr_codes?count=1",
  {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  }
);
console.log(
  JSON.stringify({
    label: "list_qr_codes",
    status: listRes.status,
    body: (await listRes.text()).slice(0, 350),
  })
);
