type AuthLogMeta = {
  userId?: string | null;
  email?: string | null;
  from?: string | null;
  to?: string | null;
  reason?: string;
};

function redact(meta: AuthLogMeta): Record<string, string> {
  const out: Record<string, string> = {};
  if (meta.userId) out.userId = meta.userId;
  if (meta.email) out.email = meta.email;
  if (meta.from) out.from = meta.from;
  if (meta.to) out.to = meta.to;
  if (meta.reason) out.reason = meta.reason;
  return out;
}

/** Dev-only. Never pass tokens, passwords, or secrets. */
export function logAuthEvent(event: string, meta: AuthLogMeta = {}) {
  if (process.env.NODE_ENV === "production") return;
  console.info("[coredash-auth]", event, { ...redact(meta), at: new Date().toISOString() });
}
