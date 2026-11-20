/**
 * Stricter email validation for public support/feedback forms.
 * Format → disposable blocklist → DNS MX → SMTP RCPT mailbox probe.
 */
import dns from "node:dns/promises";
import net from "node:net";

const FORMAT_RE =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Common disposable / fake inbox providers — reject early. */
const DISPOSABLE = new Set(
  [
    "mailinator.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "sharklasers.com",
    "grr.la",
    "yopmail.com",
    "tempmail.com",
    "temp-mail.org",
    "throwaway.email",
    "10minutemail.com",
    "trashmail.com",
    "fakeinbox.com",
    "getnada.com",
    "maildrop.cc",
    "dispostable.com",
    "mailnesia.com",
    "tempail.com",
    "moakt.com",
    "emailondeck.com",
    "mintemail.com",
  ].map((d) => d.toLowerCase()),
);

/**
 * When SMTP mailbox probe is blocked (e.g. Zoho dynamic-IP policy),
 * only these local-parts are accepted on our own domains.
 */
const OWN_DOMAINS = new Set(["gatimitra.com"]);
const OWN_LOCAL_ALLOW = new Set([
  "support",
  "business",
  "grievance",
  "dpo",
  "info",
  "hello",
  "admin",
  "care",
  "help",
  "noreply",
  "no-reply",
  "team",
]);

const MAILBOX_MISSING_MSG =
  "This email address does not exist. Please check for typos.";
const DOMAIN_INVALID_MSG = "Invalid email domain. Please check for typos.";

export type EmailCheckResult = {
  ok: boolean;
  email: string;
  reason?: string;
};

type MailboxProbe =
  | { status: "exists" }
  | { status: "missing" }
  | { status: "inconclusive"; reason?: string };

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Fast client/server format check (no DNS). */
export function isEmailFormatValid(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;
  if (email.includes("..") || email.startsWith(".") || email.includes("@.")) {
    return false;
  }
  if (!FORMAT_RE.test(email)) return false;
  const [local, domain] = email.split("@");
  if (!local || !domain) return false;
  if (local.length > 64) return false;
  const labels = domain.split(".");
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1] ?? "";
  if (!/^[a-z]{2,24}$/i.test(tld)) return false;
  return true;
}

function domainOf(email: string): string {
  return email.split("@")[1] ?? "";
}

function localOf(email: string): string {
  return email.split("@")[0] ?? "";
}

async function resolveMxHosts(domain: string): Promise<string[]> {
  try {
    const mx = await dns.resolveMx(domain);
    if (Array.isArray(mx) && mx.length > 0) {
      return mx
        .slice()
        .sort((a, b) => a.priority - b.priority)
        .map((m) => m.exchange)
        .filter(Boolean);
    }
  } catch {
    // fall through
  }
  return [];
}

async function domainAcceptsMail(domain: string): Promise<boolean> {
  const mx = await resolveMxHosts(domain);
  if (mx.length > 0) return true;
  try {
    const a = await dns.resolve4(domain);
    if (Array.isArray(a) && a.length > 0) return true;
  } catch {
    /* ignore */
  }
  try {
    const aaaa = await dns.resolve6(domain);
    if (Array.isArray(aaaa) && aaaa.length > 0) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function classifyRcpt(code: number, last: string): MailboxProbe {
  const text = last.toLowerCase();
  const policy =
    /policy|spamhaus|dynamic ip|blocked|blacklist|greylist|try again later|rate limit|too many/.test(
      text,
    );

  if (code === 250 || code === 251) {
    return { status: "exists" };
  }

  // Definitive mailbox missing (Gmail / Google Workspace / many hosts)
  const missing =
    code === 511 ||
    code === 550 ||
    code === 551 ||
    code === 552 ||
    code === 553 ||
    /no such user|user unknown|mailbox unavailable|does not exist|invalid recipient|recipient rejected|unknown user|not a valid|address rejected|nosuchuser|5\.1\.1|5\.1\.3/.test(
      text,
    );

  if (missing && !policy) {
    return { status: "missing" };
  }

  return { status: "inconclusive", reason: policy ? "policy" : `code_${code}` };
}

function probeOneMx(host: string, email: string): Promise<MailboxProbe> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 25 });
    let buf = "";
    let step = 0;
    const finish = (result: MailboxProbe) => {
      try {
        socket.write("QUIT\r\n");
      } catch {
        /* ignore */
      }
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ status: "inconclusive", reason: "timeout" }),
      8_000,
    );

    socket.setEncoding("utf8");
    const send = (cmd: string) => {
      socket.write(`${cmd}\r\n`);
    };

    socket.on("error", () => {
      clearTimeout(timer);
      resolve({ status: "inconclusive", reason: "connect_error" });
    });

    socket.on("data", (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      if (last.length < 4 || last[3] === "-") return;
      const code = Number(last.slice(0, 3));
      if (!Number.isFinite(code)) return;
      buf = "";

      if (step === 0) {
        if (code !== 220) {
          clearTimeout(timer);
          finish({ status: "inconclusive", reason: "bad_banner" });
          return;
        }
        step = 1;
        send("EHLO verify.gatimitra.com");
        return;
      }

      if (step === 1) {
        if (code < 200 || code >= 400) {
          clearTimeout(timer);
          finish({ status: "inconclusive", reason: "ehlo_fail" });
          return;
        }
        step = 2;
        send("MAIL FROM:<noreply@gatimitra.com>");
        return;
      }

      if (step === 2) {
        if (code < 200 || code >= 400) {
          clearTimeout(timer);
          finish(classifyRcpt(code, last));
          return;
        }
        step = 3;
        send(`RCPT TO:<${email}>`);
        return;
      }

      if (step === 3) {
        clearTimeout(timer);
        finish(classifyRcpt(code, last));
      }
    });
  });
}

/**
 * Probe mailbox via SMTP RCPT TO against MX hosts.
 * Returns exists / missing / inconclusive (policy, timeout, blocked port 25).
 */
async function probeMailbox(email: string, domain: string): Promise<MailboxProbe> {
  const hosts = await resolveMxHosts(domain);
  if (hosts.length === 0) {
    return { status: "inconclusive", reason: "no_mx" };
  }

  for (const host of hosts.slice(0, 3)) {
    const result = await probeOneMx(host, email);
    if (result.status === "exists" || result.status === "missing") {
      return result;
    }
  }

  return { status: "inconclusive", reason: "all_mx_inconclusive" };
}

/**
 * Full validation: format → disposable → DNS MX → SMTP mailbox.
 * Use on Node server (feedback/support APIs).
 */
export async function validateRealEmail(raw: string): Promise<EmailCheckResult> {
  const email = normalizeEmail(raw);
  if (!isEmailFormatValid(email)) {
    return {
      ok: false,
      email,
      reason: "Enter a valid email address (e.g. name@company.com).",
    };
  }

  const domain = domainOf(email);
  if (DISPOSABLE.has(domain)) {
    return {
      ok: false,
      email,
      reason: "Disposable / temporary emails are not allowed. Use a real inbox.",
    };
  }

  const accepts = await domainAcceptsMail(domain);
  if (!accepts) {
    return { ok: false, email, reason: DOMAIN_INVALID_MSG };
  }

  const mailbox = await probeMailbox(email, domain);
  if (mailbox.status === "missing") {
    return { ok: false, email, reason: MAILBOX_MISSING_MSG };
  }
  if (mailbox.status === "exists") {
    return { ok: true, email };
  }

  // Inconclusive (Zoho dynamic-IP policy, port 25 blocked, timeout, …)
  if (OWN_DOMAINS.has(domain)) {
    const local = localOf(email);
    if (OWN_LOCAL_ALLOW.has(local)) {
      return { ok: true, email };
    }
    // Random addresses on our Zoho domain cannot be SMTP-verified from
    // residential IPs — treat as non-existent rather than accepting typos.
    return { ok: false, email, reason: MAILBOX_MISSING_MSG };
  }

  // Other providers: domain has MX; mailbox probe inconclusive → allow
  // (cannot reliably verify without a paid verification API).
  return { ok: true, email };
}
