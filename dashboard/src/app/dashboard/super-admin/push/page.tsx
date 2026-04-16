"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { ArrowLeft, Bell, Bike, Gift, ImageIcon, Megaphone, Store } from "lucide-react";

const lbl = "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500";
const inp =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-teal-600 focus:ring-1 focus:ring-teal-600";
const sel = `${inp} py-2`;
const area = `${inp} min-h-[72px] resize-y`;

const EMOJI_CHOICES = ["🔔", "🎉", "🚚", "🍽️", "💳", "⭐", "🎁", "⚡", "✅", "📣", "❤️", "🛵"] as const;

const ICON_OPTIONS = [
  { id: "bell", label: "Bell", Icon: Bell },
  { id: "megaphone", label: "Megaphone", Icon: Megaphone },
  { id: "gift", label: "Gift", Icon: Gift },
  { id: "bike", label: "Rider", Icon: Bike },
  { id: "store", label: "Store", Icon: Store },
] as const;

type IconId = (typeof ICON_OPTIONS)[number]["id"];
type NotifyType = "BASIC" | "RICH" | "ACTIONABLE";
type Role = "customer" | "merchant" | "rider";
type PreviewMode = "tray" | "in_app";

type SendPayload = {
  title: string;
  message: string;
  type: NotifyType;
  image: string | null;
  emoji: string | null;
  target_role: Role;
  target_user_ids: string[] | null;
  notification_icon: string;
  deep_link: string | null;
  screen: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function readSendResponse(json: unknown): {
  ok: boolean;
  tokensTargeted: number;
  ticketsOk: number;
  ticketsErr: number;
  message: string;
} {
  if (!isRecord(json)) {
    return { ok: false, tokensTargeted: 0, ticketsOk: 0, ticketsErr: 0, message: "Invalid response" };
  }
  const ok = json.ok === true;
  const tokensTargeted = typeof json.tokens_targeted === "number" ? json.tokens_targeted : 0;
  const ticketsOk = typeof json.expo_tickets_ok === "number" ? json.expo_tickets_ok : 0;
  const ticketsErr = typeof json.expo_tickets_error === "number" ? json.expo_tickets_error : 0;
  const message =
    typeof json.message === "string"
      ? json.message
      : typeof json.error === "string"
        ? json.error
        : "Request failed";
  return { ok, tokensTargeted, ticketsOk, ticketsErr, message };
}

export default function SuperAdminPushPage() {
  const [title, setTitle] = useState("Hello from GatiMitra");
  const [message, setMessage] = useState("This is a test notification with live preview.");
  const [targetRole, setTargetRole] = useState<Role>("customer");
  const [notifyType, setNotifyType] = useState<NotifyType>("BASIC");
  const [imageUrl, setImageUrl] = useState("");
  const [emoji, setEmoji] = useState("");
  const [notificationIcon, setNotificationIcon] = useState<IconId>("bell");
  const [deepLink, setDeepLink] = useState("");
  const [screen, setScreen] = useState("/notifications");
  const [targetUserIds, setTargetUserIds] = useState("");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("tray");
  const [sending, setSending] = useState(false);

  const previewTitle = useMemo(() => {
    const e = emoji.trim();
    return e ? `${e} ${title}`.trim() : title;
  }, [emoji, title]);

  const selectedIcon = ICON_OPTIONS.find((o) => o.id === notificationIcon) ?? ICON_OPTIONS[0];
  const SelectedIcon = selectedIcon.Icon;

  const sendPayload = useCallback((): SendPayload => {
    const ids = targetUserIds
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title: title.trim(),
      message: message.trim(),
      type: notifyType,
      image: imageUrl.trim() || null,
      emoji: emoji.trim() || null,
      target_role: targetRole,
      target_user_ids: ids.length > 0 ? ids : null,
      notification_icon: notificationIcon,
      deep_link: deepLink.trim() || null,
      screen: notifyType === "ACTIONABLE" ? (screen.trim() || null) : null,
    };
  }, [title, message, notifyType, imageUrl, emoji, targetRole, targetUserIds, notificationIcon, deepLink, screen]);

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error("Title and message are required.");
      return;
    }
    if (notifyType === "RICH" && !imageUrl.trim()) {
      toast.error("Rich notifications need a public image URL (PNG recommended).");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/super-admin/push/send-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sendPayload()),
      });
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        toast.error("Invalid JSON from server");
        return;
      }
      const body = readSendResponse(parsed);
      if (!res.ok || !body.ok) {
        toast.error(body.message || `Send failed (${res.status})`);
        return;
      }
      if (body.tokensTargeted <= 0) {
        toast.error("No devices found for this role yet. Open the app once and allow notifications so it can register a push token.");
        return;
      }
      toast.success(`Notification sent successfully — ${body.tokensTargeted} devices`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-full bg-slate-100 text-slate-900">
      <div className="w-full px-3 py-4 md:px-6 md:py-5">
        <header className="mb-4 border-b border-slate-200 pb-3">
          <h1 className="text-lg font-bold tracking-tight md:text-xl">Push notification</h1>
          <p className="mt-1 text-xs text-slate-600 md:text-sm">
            Send notifications to Riders, Customers, and Merchants instantly across all apps — fast, reliable, and in
            real-time.
          </p>
        </header>

        <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <label className={lbl} htmlFor="push-title">
                Title
              </label>
              <input
                id="push-title"
                className={inp}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Notification title"
              />
            </div>

            <div>
              <label className={lbl} htmlFor="push-message">
                Message
              </label>
              <textarea
                id="push-message"
                className={area}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message body"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <label className={lbl} htmlFor="push-role">
                  Send to
                </label>
                <select
                  id="push-role"
                  className={sel}
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as Role)}
                >
                  <option value="customer">Customer</option>
                  <option value="merchant">Merchant</option>
                  <option value="rider">Rider</option>
                </select>
              </div>
              <div>
                <label className={lbl} htmlFor="push-type">
                  Type
                </label>
                <select
                  id="push-type"
                  className={sel}
                  value={notifyType}
                  onChange={(e) => setNotifyType(e.target.value as NotifyType)}
                >
                  <option value="BASIC">Basic</option>
                  <option value="RICH">Rich</option>
                  <option value="ACTIONABLE">Actionable</option>
                </select>
              </div>
            </div>

            {(notifyType === "RICH" || notifyType === "ACTIONABLE") && (
              <div>
                <label className={lbl} htmlFor="push-image">
                  Image URL (HTTPS)
                </label>
                <input
                  id="push-image"
                  className={inp}
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            )}

            <div>
              <span className={lbl}>Emoji</span>
              <div className="flex flex-wrap gap-1">
                {EMOJI_CHOICES.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setEmoji((prev) => (prev === ch ? "" : ch))}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-sm ${
                      emoji === ch
                        ? "border-teal-600 bg-teal-50"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                    aria-label={`Emoji ${ch}`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className={lbl}>Icon</span>
              <div className="flex flex-wrap gap-1">
                {ICON_OPTIONS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setNotificationIcon(id)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium ${
                      notificationIcon === id
                        ? "border-teal-600 bg-teal-50 text-teal-900"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {notifyType === "ACTIONABLE" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className={lbl} htmlFor="push-deeplink">
                    Deep link
                  </label>
                  <input
                    id="push-deeplink"
                    className={inp}
                    value={deepLink}
                    onChange={(e) => setDeepLink(e.target.value)}
                    placeholder="gatimitra-merchant://…"
                  />
                </div>
                <div>
                  <label className={lbl} htmlFor="push-screen">
                    Screen path
                  </label>
                  <input
                    id="push-screen"
                    className={inp}
                    value={screen}
                    onChange={(e) => setScreen(e.target.value)}
                    placeholder="/notifications"
                  />
                </div>
              </div>
            )}

            <div>
              <label className={lbl} htmlFor="push-user-ids">
                User IDs (optional)
              </label>
              <textarea
                id="push-user-ids"
                className={`${area} min-h-[52px] font-mono text-xs`}
                value={targetUserIds}
                onChange={(e) => setTargetUserIds(e.target.value)}
                placeholder="Comma-separated; empty = all in role"
              />
            </div>

            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSend()}
              className="w-full rounded-lg bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send notification"}
            </button>
          </div>

          <aside className="w-full shrink-0 space-y-2 border-t border-slate-200 pt-4 lg:w-72 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Preview</h2>
              <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setPreviewMode("tray")}
                  className={`rounded px-2 py-0.5 ${previewMode === "tray" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
                >
                  Tray
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("in_app")}
                  className={`rounded px-2 py-0.5 ${previewMode === "in_app" ? "bg-slate-100 text-slate-900" : "text-slate-500"}`}
                >
                  In app
                </button>
              </div>
            </div>

            {previewMode === "tray" ? (
              <div className="rounded-lg border border-slate-300 bg-slate-800 p-3">
                <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-slate-500">Tray</p>
                <div className="rounded-md border border-slate-600 bg-slate-900 p-2.5">
                  <div className="flex gap-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-teal-300">
                      <SelectedIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-white">{previewTitle || "Title"}</p>
                      <p className="mt-0.5 line-clamp-3 text-[11px] leading-snug text-slate-400">{message}</p>
                      {notifyType === "RICH" && imageUrl.trim() ? (
                        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-500">
                          <ImageIcon className="h-3 w-3" />
                          Image
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">In app</p>
                {notifyType === "RICH" && imageUrl.trim() ? (
                  <div className="overflow-hidden rounded-md border border-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-28 w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                    <div className="p-2">
                      <p className="text-sm font-bold text-slate-900">{previewTitle}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{message}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 rounded-md border border-slate-200 p-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-800">
                      <SelectedIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900">{previewTitle}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{message}</p>
                      {notifyType === "ACTIONABLE" ? (
                        <p className="mt-1 text-[10px] font-medium text-teal-700">
                          Opens: {deepLink.trim() || screen.trim() || "—"}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="h-1" />
          </aside>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
