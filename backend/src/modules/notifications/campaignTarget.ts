/**
 * Expand a raw admin-entered user id (GM… / GMMP… / GMR… / usr_… / digits)
 * into candidate ids that exist in expo_push_tokens / parents / customers.
 */
export function expandCampaignUserIdCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const compact = trimmed.toUpperCase().replace(/\s+/g, "");
  const out = new Set<string>([trimmed]);

  const usrMatch = trimmed.match(/^usr_(\d+)$/i);
  const gmrMatch = compact.match(/^GMR(\d+)$/);
  if (usrMatch || gmrMatch) {
    const pk = Number(usrMatch?.[1] ?? gmrMatch?.[1]);
    if (Number.isFinite(pk) && pk > 0) {
      out.add(`usr_${pk}`);
      out.add(`GMR${pk}`);
    }
    return [...out];
  }

  if (/^\d+$/.test(compact)) {
    out.add(`GM${compact}`);
    out.add(`GMMP${compact}`);
    out.add(`usr_${compact}`);
    out.add(`GMR${compact}`);
    return [...out];
  }

  if (/^GM\d+$/i.test(compact)) out.add(compact);
  if (/^GMMP\d+$/i.test(compact)) out.add(compact);
  if (/^GMR\d+$/i.test(compact)) {
    out.add(compact);
    const pk = Number(compact.replace(/^GMR/i, ""));
    if (Number.isFinite(pk) && pk > 0) out.add(`usr_${pk}`);
  }

  return [...out];
}

/**
 * Infer which app role a campaign target is aimed at.
 * Returns null for ambiguous targets (topic / device token) where we skip the check.
 */
export function expectedRoleFromTarget(
  target: Record<string, unknown>,
): "customer" | "merchant" | "rider" | null {
  if (target.all_customers === true) return "customer";
  if (target.all_merchants === true) return "merchant";
  if (target.all_riders === true) return "rider";
  if (typeof target.store_id === "number" || typeof target.store_id === "string") {
    return "merchant";
  }
  if (Array.isArray(target.store_ids) && target.store_ids.length > 0) {
    return "merchant";
  }
  if (Array.isArray(target.user_ids) && target.user_ids.length > 0) {
    const roles = new Set<"customer" | "merchant" | "rider">();
    for (const raw of target.user_ids) {
      const id = String(raw).trim().toUpperCase();
      if (!id) continue;
      if (/^GMR\d+$/.test(id) || /^USR_\d+$/.test(id)) roles.add("rider");
      else if (/^GMMP\d+$/.test(id)) roles.add("merchant");
      else if (/^GM\d+$/.test(id)) roles.add("customer");
    }
    if (roles.size === 1) return [...roles][0]!;
  }
  if (typeof target.role === "string") {
    const r = target.role.toLowerCase();
    if (r === "customer" || r === "merchant" || r === "rider") return r;
  }
  // Pure geo target (`geo: true` without role) is role-ambiguous — template may be `all`.
  if (target.geo === true) return null;
  if (typeof target.topic === "string") {
    const t = target.topic.trim();
    if (t === "app_customer") return "customer";
    if (t === "app_merchant") return "merchant";
    if (t === "app_rider") return "rider";
  }
  // Pure geo target (city / lat-lng without an explicit role) is role-ambiguous.
  return null;
}

/** True when template.role is compatible with the resolved audience role. */
export function templateRoleMatchesTarget(
  templateRole: string,
  expected: "customer" | "merchant" | "rider" | null,
): boolean {
  if (!expected) return true;
  const role = templateRole.toLowerCase();
  if (role === "all") return true;
  return role === expected;
}

/** Default announcement template for a target role. */
export function defaultAnnouncementTemplateForRole(
  role: "customer" | "merchant" | "rider" | null,
): string | null {
  if (role === "customer") return "CUSTOMER_ANNOUNCEMENT";
  if (role === "merchant") return "MERCHANT_ANNOUNCEMENT";
  if (role === "rider") return "RIDER_ANNOUNCEMENT";
  return null;
}

/**
 * Human-readable soft-skip / advisory copy when push devices are missing.
 * Avoids the generic “Expo Go” message for customer / rider campaigns.
 */
export function softSkipWarningForTarget(
  target: Record<string, unknown>,
  skipReason: "no_recipients" | "quiet_hours" | string,
  opts?: { inboxOnlyCount?: number },
): string {
  if (skipReason === "quiet_hours") {
    return "Quiet hours active — push skipped. Campaign recorded.";
  }
  const role = expectedRoleFromTarget(target ?? {});
  if (opts?.inboxOnlyCount && opts.inboxOnlyCount > 0) {
    const who =
      role === "customer"
        ? "customers"
        : role === "rider"
          ? "riders"
          : role === "merchant"
            ? "merchants"
            : "users";
    return (
      `No push devices registered for this ${role ?? "audience"}. ` +
      `Recorded in-app for ${opts.inboxOnlyCount} ${who}. ` +
      `Open the ${role ?? "mobile"} app once (with notifications allowed) to enable push.`
    );
  }
  if (role === "customer") {
    return (
      "No customer devices registered. Open the customer app on a device " +
      "(notifications allowed) so a push token can register, then resend. Campaign recorded."
    );
  }
  if (role === "rider") {
    return (
      "No rider devices registered. Open the rider app on a device " +
      "(notifications allowed) so a push token can register, then resend. Campaign recorded."
    );
  }
  if (role === "merchant") {
    return (
      "No merchant devices registered for this target. " +
      "Open the partner app or partnersite with notifications allowed, then resend. Campaign recorded."
    );
  }
  return (
    "No registered push devices for this target. " +
    "Open the target app once with notifications allowed, then resend. Campaign recorded."
  );
}
