export const RECON_REASON_SEP = " !!!!!! ";

function serializeDateForApi(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export type SidebarRemark = {
  id: string;
  type: string;
  content: string;
  time: string;
  actorType?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  canEdit?: boolean;
  editedAtIso?: string | null;
  editedTimeLabel?: string | null;
  createdAtIso?: string;
};

export type SidebarCxNotification = {
  id: string;
  /** Full stored message (often "Title: Body"). */
  message: string;
  /** Push title the admin selected / sent. */
  title: string | null;
  /** Message body without the title prefix. */
  body: string | null;
  time: string;
  actorType: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

/** Split history text stored as "Title: Body", or use metadata when present. */
export function splitCxNotificationMessage(
  message: string,
  metadata?: unknown
): { title: string | null; body: string | null } {
  const meta =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>)
      : null;
  const metaTitle =
    typeof meta?.title === "string" && meta.title.trim() ? meta.title.trim() : null;
  const metaBody =
    typeof meta?.body === "string" && meta.body.trim() ? meta.body.trim() : null;
  if (metaTitle || metaBody) {
    return {
      title: metaTitle,
      body: metaBody ?? (message.trim() || null),
    };
  }

  const text = message.trim();
  if (!text) return { title: null, body: null };
  const sep = text.indexOf(": ");
  if (sep > 0 && sep <= 120) {
    return {
      title: text.slice(0, sep).trim() || null,
      body: text.slice(sep + 2).trim() || null,
    };
  }
  return { title: null, body: text };
}

export type SidebarRecon = {
  id: string;
  rider: string;
  providerName?: string | null;
  riderName?: string | null;
  riderMobile?: string | null;
  reason: string;
  reasonCategory: string | null;
  comment: string | null;
  time: string;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
};

function formatRemarkTime(created: Date): string {
  return created.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatReconDisplayTime(isoOrDate: string | Date): string {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function normalizeProviderName(name: string | null | undefined): string | null {
  if (!name || !String(name).trim()) return null;
  const t = String(name).trim().toLowerCase();
  if (t === "internal") return "GatiMitra";
  return String(name).trim();
}

export function buildReconRiderLabel(params: {
  providerName?: string | null;
  riderName?: string | null;
  riderMobile?: string | null;
}): string {
  const provider =
    normalizeProviderName(params.providerName) ?? params.providerName?.trim() ?? "";
  const name = params.riderName?.trim() ?? "";
  const mobile = params.riderMobile?.trim() ?? "";
  if (!provider && !name && !mobile) return "Unknown rider";
  if (!provider) {
    if (name && mobile) return `${name} [ ${mobile} ]`;
    return name || mobile || "Unknown rider";
  }
  if (!name && !mobile) return provider;
  if (name && mobile) return `${provider}( ${name} [ ${mobile} ] )`;
  if (name) return `${provider}( ${name} )`;
  return `${provider}( [ ${mobile} ] )`;
}

export function parseReconReasonFields(
  reconReason: string,
  reconReasonCategory: string | null | undefined
): { reasonCategory: string | null; comment: string | null } {
  const sepIdx = reconReason.indexOf(RECON_REASON_SEP);
  if (sepIdx >= 0) {
    return {
      reasonCategory: reconReason.slice(0, sepIdx).trim() || null,
      comment: reconReason.slice(sepIdx + RECON_REASON_SEP.length).trim() || null,
    };
  }
  const category = reconReasonCategory?.trim() || null;
  if (category && category !== reconReason.trim()) {
    return { reasonCategory: category, comment: reconReason.trim() || null };
  }
  return { reasonCategory: null, comment: reconReason.trim() || null };
}

export function mapRemarksFromApi(
  items: Array<{
    id: number;
    remark: string;
    remarkCategory: string | null;
    actorType?: string | null;
    actorName?: string | null;
    remarkMetadata?: { actorEmail?: string | null } | null;
    createdAt?: string | Date;
    lastEditedAt?: string | Date | null;
  }>,
  userEmail: string | null
): SidebarRemark[] {
  const nowMs = Date.now();
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;

  return items.map((r) => {
    const created = r.createdAt ? new Date(r.createdAt) : new Date();
    const edited = r.lastEditedAt ? new Date(r.lastEditedAt) : null;
    const actorEmail =
      typeof r.remarkMetadata?.actorEmail === "string" ? r.remarkMetadata.actorEmail : null;
    const withinWindow = nowMs - created.getTime() <= FIFTEEN_MIN_MS;
    const canEdit =
      !!actorEmail &&
      !!userEmail &&
      actorEmail.toLowerCase() === userEmail.toLowerCase() &&
      !edited &&
      withinWindow;

    return {
      id: String(r.id),
      type: r.remarkCategory ?? "OTHER",
      content: r.remark,
      actorType: r.actorType ?? null,
      actorName: r.actorName ?? null,
      actorEmail,
      canEdit,
      createdAtIso: r.createdAt
        ? new Date(r.createdAt).toISOString()
        : created.toISOString(),
      editedAtIso: edited ? edited.toISOString() : null,
      editedTimeLabel: edited ? formatRemarkTime(edited) : null,
      time: formatRemarkTime(created),
    };
  });
}

export function mapNotificationsFromApi(
  items: Array<{
    id: number;
    message: string;
    sentByEmail?: string | null;
    sentByName?: string | null;
    sentByRole?: string | null;
    sentAt?: string | Date;
    notificationMetadata?: unknown;
  }>
): SidebarCxNotification[] {
  return items.map((n) => {
    const sent = n.sentAt ? new Date(n.sentAt) : new Date();
    const { title, body } = splitCxNotificationMessage(
      n.message,
      n.notificationMetadata
    );
    return {
      id: String(n.id),
      message: n.message,
      title,
      body,
      actorType: n.sentByRole ?? null,
      actorName: n.sentByName ?? null,
      actorEmail: n.sentByEmail ?? null,
      time: sent.toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    };
  });
}

export function mapReconsFromApi(
  items: Array<{
    id: number;
    providerName: string | null;
    riderName: string | null;
    riderMobile: string | null;
    reconReason: string;
    reconReasonCategory?: string | null;
    reconAt: string | Date;
    actorEmail?: string | null;
    actorRole?: string | null;
  }>
): SidebarRecon[] {
  return items.map((r) => {
    const created = r.reconAt instanceof Date ? r.reconAt : new Date(r.reconAt);
    const { reasonCategory, comment } = parseReconReasonFields(
      r.reconReason,
      r.reconReasonCategory
    );
    return {
      id: String(r.id),
      providerName: r.providerName,
      riderName: r.riderName,
      riderMobile: r.riderMobile,
      rider: buildReconRiderLabel({
        providerName: normalizeProviderName(r.providerName) ?? r.providerName,
        riderName: r.riderName,
        riderMobile: r.riderMobile,
      }),
      reason: r.reconReason,
      reasonCategory,
      comment,
      time: formatReconDisplayTime(created),
      actorEmail: r.actorEmail ?? null,
      actorRole: r.actorRole ?? null,
    };
  });
}

export function serializeRemarkForApi(r: {
  id: number;
  remark: string;
  remarkCategory: string | null;
  actorType: string;
  actorName: string | null;
  remarkMetadata: unknown;
  createdAt: Date | string;
  lastEditedAt: Date | string | null;
}) {
  return {
    id: r.id,
    remark: r.remark,
    remarkCategory: r.remarkCategory,
    actorType: r.actorType,
    actorName: r.actorName,
    remarkMetadata: r.remarkMetadata,
    createdAt: serializeDateForApi(r.createdAt) ?? new Date().toISOString(),
    lastEditedAt: serializeDateForApi(r.lastEditedAt),
  };
}

export function serializeReconForApi(r: {
  id: number;
  providerName: string | null;
  riderName: string | null;
  riderMobile: string | null;
  reconReason: string;
  reconReasonCategory: string | null;
  reconAt: Date | string;
  actorEmail: string | null;
  actorRole?: string | null;
}) {
  return {
    id: r.id,
    providerName: r.providerName,
    riderName: r.riderName,
    riderMobile: r.riderMobile,
    reconReason: r.reconReason,
    reconReasonCategory: r.reconReasonCategory,
    reconAt: serializeDateForApi(r.reconAt) ?? new Date().toISOString(),
    actorEmail: r.actorEmail,
    actorRole: r.actorRole ?? null,
  };
}

export function serializeNotificationForApi(n: {
  id: number;
  message: string;
  sentByEmail: string | null;
  sentByName: string | null;
  sentByRole: string | null;
  sentAt: Date | string;
  notificationMetadata?: unknown;
}) {
  return {
    id: n.id,
    message: n.message,
    sentByEmail: n.sentByEmail,
    sentByName: n.sentByName,
    sentByRole: n.sentByRole,
    sentAt: serializeDateForApi(n.sentAt) ?? new Date().toISOString(),
    notificationMetadata: n.notificationMetadata ?? null,
  };
}
