"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  UserPlus,
  Shield,
  Loader2,
  Trash2,
  Eye,
  X,
  Check,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

type StaffMember = {
  id: number;
  name: string;
  phone_number: string;
  role: string;
};

type OwnerInfo = {
  owner_name: string | null;
  owner_email: string | null;
  registered_phone: string | null;
  parent_name: string | null;
};

type StaffRole = "OWNER" | "MANAGER" | "STAFF";

type DeviceSession = {
  id: number;
  device_id: string | null;
  device_name: string | null;
  device_type: string | null;
  os: string | null;
  login_time: string;
  last_active: string;
  app_source: string | null;
  user_agent: string | null;
};

/** Dashboard header is ~3.5rem (top-14); keep sheet below it. */
const SHEET_TOP = "3.5rem";

const STAFF_PERMISSIONS = [
  { id: "home", title: "Home", description: "Business reports, payouts etc." },
  { id: "menu", title: "Menu management", description: "Edit items and item details" },
  { id: "promo", title: "Marketing | Promo", description: "Create and manage discounts" },
  { id: "ads", title: "Marketing | Ads", description: "Create and manage ad campaigns" },
  { id: "operations", title: "Operations", description: "Orders & complaints" },
  { id: "users", title: "Manage users", description: "Owner, manager, staff contacts" },
  { id: "outlet", title: "Manage outlet settings", description: "Timings, contact & more" },
  { id: "payouts", title: "Manage payouts", description: "Payouts, invoices & tax" },
] as const;

const ROLE_PERMS: Record<StaffRole, readonly string[]> = {
  OWNER: STAFF_PERMISSIONS.map((p) => p.id),
  MANAGER: ["home", "menu", "promo", "operations", "users", "outlet", "payouts"],
  STAFF: ["home", "operations"],
};

function onlyDigits(v: string): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

function normalizeRole(role: string): StaffRole {
  const r = role.trim().toUpperCase();
  if (r === "OWNER") return "OWNER";
  if (r === "MANAGER") return "MANAGER";
  return "STAFF";
}

function deviceLabel(s: DeviceSession): string {
  const src =
    s.app_source === "merchant_app"
      ? "Merchant app"
      : s.app_source === "partnersite"
        ? "Partner site"
        : s.app_source === "dashboard"
          ? "Dashboard"
          : s.device_type === "web"
            ? "Web"
            : "Device";
  return `${src} · ${s.device_name?.trim() || s.os || "Unknown device"}`;
}

function DashSidesheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[90] flex justify-end"
      style={{ top: SHEET_TOP }}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/35"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full min-h-0 w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 py-3.5">
          <div className="min-w-0 pr-2">
            <h3 className="text-lg font-bold text-gray-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-gray-200 px-4 py-3">{footer}</div>
        ) : null}
      </aside>
    </div>,
    document.body
  );
}

export function StaffAndAccessPanel({ storeInternalId }: { storeInternalId: number }) {
  const base = `/api/merchant/stores/${storeInternalId}/staff`;
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [owner, setOwner] = useState<OwnerInfo | null>(null);
  const [view, setView] = useState<"home" | "invite">("home");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<"MANAGER" | "STAFF">("STAFF");
  const [permsOpen, setPermsOpen] = useState(false);
  const [permsRole, setPermsRole] = useState<StaffRole>("OWNER");

  const [devicesOpen, setDevicesOpen] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);

  const [otpOpen, setOtpOpen] = useState(false);
  const [otpDigits, setOtpDigits] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpPurpose, setOtpPurpose] = useState<
    "invite" | "remove_staff" | "logout_device" | "logout_all" | null
  >(null);
  const [otpMasked, setOtpMasked] = useState("");
  const [pendingRemove, setPendingRemove] = useState<StaffMember | null>(null);
  const [pendingInvite, setPendingInvite] = useState<{
    name: string;
    phone: string;
    role: "MANAGER" | "STAFF";
  } | null>(null);
  const [pendingLogout, setPendingLogout] = useState<{
    kind: "one" | "all";
    device_id?: string;
    session_id?: number;
  } | null>(null);

  const managers = useMemo(
    () => staff.filter((s) => normalizeRole(s.role) === "MANAGER"),
    [staff]
  );
  const staffMembers = useMemo(
    () => staff.filter((s) => normalizeRole(s.role) === "STAFF"),
    [staff]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(base, { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load staff");
      setStaff(Array.isArray(data.staff) ? data.staff : []);
      setOwner(data.owner ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch(`${base}/devices`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load devices");
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } finally {
      setDevicesLoading(false);
    }
  }, [base]);

  const openDevices = async () => {
    try {
      await loadDevices();
      setDevicesOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load devices");
    }
  };

  const startOtp = async (
    purpose: "invite" | "remove_staff" | "logout_device" | "logout_all"
  ) => {
    setOtpPurpose(purpose);
    setOtpDigits("");
    setOtpRequestId(null);
    setOtpOpen(true);
    setOtpSending(true);
    try {
      const res = await fetch(`${base}/action-otp/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "OTP send failed");
      setOtpRequestId(data.requestId);
      const channels = [data.maskedPhone, data.maskedEmail].filter(Boolean).join(" or ");
      setOtpMasked(
        channels
          ? `OTP sent to owner on ${channels}${data.devOtp ? `\nDev OTP: ${data.devOtp}` : ""}`
          : "OTP sent to owner"
      );
      if (typeof data.devOtp === "string") setOtpDigits(data.devOtp);
    } catch (e) {
      setOtpOpen(false);
      toast.error(e instanceof Error ? e.message : "OTP failed");
    } finally {
      setOtpSending(false);
    }
  };

  const verifyAndRun = async () => {
    if (!otpRequestId || !otpPurpose) return;
    setOtpVerifying(true);
    try {
      const vRes = await fetch(`${base}/action-otp/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: otpRequestId,
          otp: otpDigits.trim(),
          purpose: otpPurpose,
        }),
      });
      const vData = await vRes.json().catch(() => ({}));
      if (!vRes.ok) throw new Error(vData.message || vData.error || "Invalid OTP");

      if (otpPurpose === "invite" && pendingInvite) {
        const res = await fetch(base, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pendingInvite.name,
            phone_number: pendingInvite.phone,
            role: pendingInvite.role,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "Invite failed");
        toast.success("Staff invited");
        setPendingInvite(null);
        setView("home");
        await load();
      } else if (otpPurpose === "remove_staff" && pendingRemove) {
        const res = await fetch(`${base}/${pendingRemove.id}`, {
          method: "DELETE",
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Remove failed");
        toast.success("Staff removed");
        setPendingRemove(null);
        await load();
      } else if (
        (otpPurpose === "logout_device" || otpPurpose === "logout_all") &&
        pendingLogout
      ) {
        const logoutRes = await fetch(`${base}/devices`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: pendingLogout.kind === "all" ? "logout_all" : "logout_one",
            device_id: pendingLogout.device_id,
            session_id: pendingLogout.session_id,
          }),
        });
        if (!logoutRes.ok) {
          const d = await logoutRes.json().catch(() => ({}));
          throw new Error(d.error || "Logout failed");
        }
        toast.success(
          pendingLogout.kind === "all" ? "Logged out all devices" : "Device logged out"
        );
        setPendingLogout(null);
        await loadDevices();
      }
      setOtpOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setOtpVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading staff…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {view === "home" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Staff & Access</h3>
              <p className="text-sm text-gray-600">
                Same roles as the merchant app. Invite/remove requires owner OTP.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPermsRole("OWNER");
                  setPermsOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Eye className="h-4 w-4" />
                View permissions
              </button>
              <button
                type="button"
                onClick={() => void openDevices()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Smartphone className="h-4 w-4" />
                Devices
              </button>
              <button
                type="button"
                onClick={() => {
                  setInviteRole("STAFF");
                  setInviteName("");
                  setInvitePhone("");
                  setView("invite");
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                <UserPlus className="h-4 w-4" />
                Invite user
              </button>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <header className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
              <Shield className="h-4 w-4 text-indigo-600" />
              <h4 className="text-sm font-semibold text-gray-900">Owner</h4>
            </header>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Name</p>
                <p className="mt-1 text-sm font-semibold">
                  {owner?.owner_name || owner?.parent_name || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Phone</p>
                <p className="mt-1 text-sm font-semibold">{owner?.registered_phone || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase text-gray-500">Email</p>
                <p className="mt-1 break-all text-sm font-semibold">{owner?.owner_email || "—"}</p>
              </div>
            </div>
          </section>

          <RoleBlock
            title="Managers"
            members={managers}
            onInvite={() => {
              setInviteRole("MANAGER");
              setView("invite");
            }}
            onRemove={(s) => {
              setPendingRemove(s);
              void startOtp("remove_staff");
            }}
          />
          <RoleBlock
            title="Staff"
            members={staffMembers}
            onInvite={() => {
              setInviteRole("STAFF");
              setView("invite");
            }}
            onRemove={(s) => {
              setPendingRemove(s);
              void startOtp("remove_staff");
            }}
          />
        </>
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">
              Invite {inviteRole === "MANAGER" ? "Manager" : "Staff"}
            </h3>
            <button
              type="button"
              onClick={() => setView("home")}
              className="rounded-lg p-1.5 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-gray-500">Role</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "MANAGER" | "STAFF")}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                <option value="MANAGER">Manager</option>
                <option value="STAFF">Staff</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-gray-500">Name</span>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-semibold uppercase text-gray-500">Phone (10 digits)</span>
              <input
                value={invitePhone}
                onChange={(e) => setInvitePhone(onlyDigits(e.target.value))}
                maxLength={10}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                const name = inviteName.trim();
                const phone = onlyDigits(invitePhone);
                if (name.length < 2) return toast.error("Enter name");
                if (phone.length !== 10) return toast.error("Enter 10-digit phone");
                setPendingInvite({ name, phone, role: inviteRole });
                void startOtp("invite");
              }}
              className="w-full rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white"
            >
              Continue with owner OTP
            </button>
          </div>
        </div>
      )}

      <DashSidesheet
        open={permsOpen}
        title="Permissions"
        subtitle="Same role matrix as the merchant app"
        onClose={() => setPermsOpen(false)}
      >
        <div className="mb-4 flex gap-2">
          {(["OWNER", "MANAGER", "STAFF"] as StaffRole[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setPermsRole(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                permsRole === r ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {r === "OWNER" ? "Owner" : r === "MANAGER" ? "Manager" : "Staff"}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {STAFF_PERMISSIONS.map((p) => {
            const ok = ROLE_PERMS[permsRole].includes(p.id);
            return (
              <li
                key={p.id}
                className="flex gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full ${
                    ok ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-400"
                  }`}
                >
                  {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </span>
                <div>
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-gray-500">{p.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </DashSidesheet>

      <DashSidesheet
        open={devicesOpen}
        title="Logged-in devices"
        subtitle="user_device_sessions — same table as merchant app"
        onClose={() => setDevicesOpen(false)}
        footer={
          <button
            type="button"
            onClick={() => {
              setPendingLogout({ kind: "all" });
              void startOtp("logout_all");
            }}
            className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700"
          >
            Log out all devices
          </button>
        }
      >
        {devicesLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No active devices</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {sessions.map((s) => (
              <li
                key={`d-${s.id}-${s.device_id ?? ""}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{deviceLabel(s)}</p>
                  <p className="text-xs text-gray-500">{s.last_active || s.login_time || "—"}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPendingLogout({
                      kind: "one",
                      device_id: s.device_id ?? undefined,
                      session_id: s.id,
                    });
                    void startOtp("logout_device");
                  }}
                  className="shrink-0 text-xs font-semibold text-red-600 hover:underline"
                >
                  Log out
                </button>
              </li>
            ))}
          </ul>
        )}
      </DashSidesheet>

      {otpOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold">Verify that it&apos;s you</h3>
            <p className="mt-1 text-sm text-gray-600">
              OTP goes to the store owner phone/email — not the invitee.
            </p>
            <p className="mt-2 whitespace-pre-line text-xs text-gray-500">{otpMasked}</p>
            {otpSending ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Sending…
              </div>
            ) : (
              <input
                value={otpDigits}
                onChange={(e) => setOtpDigits(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-3 text-center text-lg tracking-widest"
                placeholder="••••••"
                maxLength={6}
              />
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOtpOpen(false);
                  setPendingInvite(null);
                  setPendingRemove(null);
                  setPendingLogout(null);
                }}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={otpSending || otpVerifying || otpDigits.length < 4}
                onClick={() => void verifyAndRun()}
                className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {otpVerifying ? "Verifying…" : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoleBlock({
  title,
  members,
  onInvite,
  onRemove,
}: {
  title: string;
  members: StaffMember[];
  onInvite: () => void;
  onRemove: (s: StaffMember) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-600" />
          <h4 className="text-sm font-semibold">
            {title} ({members.length})
          </h4>
        </div>
        <button
          type="button"
          onClick={onInvite}
          className="text-xs font-semibold text-indigo-700 hover:underline"
        >
          Invite
        </button>
      </header>
      {members.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-500">No {title.toLowerCase()} yet</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">{m.name}</p>
                <p className="text-xs text-gray-500">{m.phone_number}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(m)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
