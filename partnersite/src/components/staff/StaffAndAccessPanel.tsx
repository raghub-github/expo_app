"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  UserPlus,
  Shield,
  Smartphone,
  Loader2,
  Trash2,
  Eye,
  X,
  Check,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import {
  STAFF_PERMISSIONS,
  STAFF_ROLE_OPTIONS,
  normalizeStaffRole,
  partnerSessionHasPermission,
  roleHasPermission,
  type MerchantStaffRole,
} from "@/lib/auth/merchant-staff-permissions";
import { useMerchantSession } from "@/context/MerchantSessionContext";

/** Sidesheet sits under partner top bar — never overlaps header. */
const SHEET_TOP = "var(--mx-partner-topbar-h, 3.5rem)";

type StaffMember = {
  id: number;
  store_id: number;
  name: string;
  phone_number: string;
  role: string;
  status: boolean;
};

type OwnerInfo = {
  owner_name: string | null;
  owner_email: string | null;
  registered_phone: string | null;
  parent_name: string | null;
  store_logo: string | null;
};

/** Same shape as merchant app `user_device_sessions` list. */
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
  is_current?: boolean;
};

type ViewMode = "home" | "invite" | "ownerEdit";

function onlyDigits(v: string): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

function maskPhone(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length < 4) return "91XXXXXX****";
  return `91XXXXXX${d.slice(-4)}`;
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
  const name = s.device_name?.trim() || s.os || "Unknown device";
  return `${src} · ${name}`;
}

function PartnerSidesheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-x-0 bottom-0 z-[900] flex justify-end"
      style={{ top: SHEET_TOP }}
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
      />
      <aside
        className={`relative flex h-full min-h-0 w-full flex-col border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200 ${
          wide ? "max-w-xl" : "max-w-md"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div className="min-w-0 pr-2">
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            {subtitle ? (
              <p className="mt-0.5 text-xs font-medium text-slate-500">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close sheet"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-slate-200 px-4 py-3">{footer}</div>
        ) : null}
      </aside>
    </div>,
    document.body
  );
}

export function StaffAndAccessPanel({ storeId }: { storeId: string }) {
  const merchantSession = useMerchantSession();
  const accessRole = normalizeStaffRole(merchantSession?.parent?.accessRole);
  const canManage = partnerSessionHasPermission(merchantSession?.parent, "users");

  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [owner, setOwner] = useState<OwnerInfo | null>(null);
  const [view, setView] = useState<ViewMode>("home");
  const [saving, setSaving] = useState(false);

  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<"MANAGER" | "STAFF">("STAFF");

  const [permsOpen, setPermsOpen] = useState(false);
  const [permsRole, setPermsRole] = useState<MerchantStaffRole>("OWNER");

  const [devicesOpen, setDevicesOpen] = useState(false);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);

  const [otpOpen, setOtpOpen] = useState(false);
  const [otpDigits, setOtpDigits] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpMeta, setOtpMeta] = useState({ title: "", body: "", masked: "" });
  const [otpRequestId, setOtpRequestId] = useState<string | null>(null);
  const [otpResendSec, setOtpResendSec] = useState(0);
  const [otpExpirySec, setOtpExpirySec] = useState(0);
  const [otpPurpose, setOtpPurpose] = useState<
    "invite" | "remove_staff" | "logout_device" | "logout_all" | null
  >(null);
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

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  const managers = useMemo(
    () => staff.filter((s) => normalizeStaffRole(s.role) === "MANAGER"),
    [staff]
  );
  const staffMembers = useMemo(
    () => staff.filter((s) => normalizeStaffRole(s.role) === "STAFF"),
    [staff]
  );

  const load = useCallback(async () => {
    if (!storeId.trim() || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/merchant/staff?storeId=${encodeURIComponent(storeId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load staff");
      setStaff(Array.isArray(data.staff) ? data.staff : []);
      setOwner(data.owner ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load staff");
    } finally {
      setLoading(false);
    }
  }, [storeId, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const res = await fetch(
        `/api/merchant/staff/devices?storeId=${encodeURIComponent(storeId)}`,
        { credentials: "include", cache: "no-store" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load devices");
      // Prefer unified `sessions` (user_device_sessions) — same as merchant app.
      const list = Array.isArray(data.sessions)
        ? data.sessions
        : [
            ...(Array.isArray(data.appSessions) ? data.appSessions : []),
            ...(Array.isArray(data.partnerSessions)
              ? data.partnerSessions.map(
                  (s: {
                    id: string;
                    device_id: string;
                    device_label: string | null;
                    last_seen_at: string | null;
                    is_current?: boolean;
                    user_agent?: string | null;
                  }) => ({
                    id: Number.parseInt(String(s.id).replace(/\D/g, ""), 10) || 0,
                    device_id: s.device_id,
                    device_name: s.device_label,
                    device_type: "web",
                    os: null,
                    login_time: s.last_seen_at || "",
                    last_active: s.last_seen_at || "",
                    app_source: "partnersite",
                    user_agent: s.user_agent ?? null,
                    is_current: s.is_current,
                  })
                )
              : []),
          ];
      setSessions(list as DeviceSession[]);
    } finally {
      setDevicesLoading(false);
    }
  }, [storeId]);

  const openDevices = async () => {
    try {
      await loadDevices();
      setDevicesOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load devices");
    }
  };

  useEffect(() => {
    if (!otpOpen) return;
    const id = window.setInterval(() => {
      setOtpResendSec((s) => Math.max(0, s - 1));
      setOtpExpirySec((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [otpOpen]);

  const applyOtpSendResult = (
    data: {
      requestId?: string;
      maskedPhone?: string;
      maskedEmail?: string | null;
      expiresInSec?: number;
    },
    keepOpenOnFail = false
  ) => {
    if (!data.requestId) {
      if (!keepOpenOnFail) setOtpOpen(false);
      throw new Error("Could not send OTP");
    }
    setOtpRequestId(data.requestId);
    const channels = [data.maskedPhone, data.maskedEmail].filter(Boolean).join(" or ");
    setOtpMeta((prev) => ({
      ...prev,
      masked: channels
        ? `Enter the OTP sent on ${channels}`
        : `Enter the OTP sent on ${maskPhone(owner?.registered_phone)}`,
    }));
    setOtpDigits("");
    const expiry = Number(data.expiresInSec);
    setOtpExpirySec(Number.isFinite(expiry) && expiry > 0 ? Math.floor(expiry) : 300);
    setOtpResendSec(30);
  };

  const startOtp = async (
    purpose: "invite" | "remove_staff" | "logout_device" | "logout_all"
  ) => {
    setOtpPurpose(purpose);
    setOtpDigits("");
    setOtpRequestId(null);
    setOtpResendSec(0);
    setOtpExpirySec(0);
    setOtpOpen(true);
    setOtpSending(true);
    setOtpMeta({
      title:
        purpose === "remove_staff"
          ? "Confirm removal"
          : purpose === "invite"
            ? "Verify that it's you"
            : "Verify that it's you",
      body:
        purpose === "invite"
          ? "Confirm this invite. OTP is sent to the owner phone and email — not the invited number."
          : purpose === "remove_staff"
            ? "Enter the OTP sent to the owner phone and email to permanently remove this user."
            : "Enter the OTP sent to the owner phone and email to continue.",
      masked: "",
    });
    try {
      const res = await fetch(
        `/api/merchant/staff/action-otp/send?storeId=${encodeURIComponent(storeId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "Could not send OTP");
      applyOtpSendResult(data);
    } catch (e) {
      setOtpOpen(false);
      toast.error(e instanceof Error ? e.message : "OTP failed");
    } finally {
      setOtpSending(false);
    }
  };

  const resendOtp = async () => {
    if (!otpPurpose || otpResendSec > 0 || otpSending) return;
    setOtpSending(true);
    try {
      const res = await fetch(
        `/api/merchant/staff/action-otp/send?storeId=${encodeURIComponent(storeId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purpose: otpPurpose }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "Could not resend OTP");
      applyOtpSendResult(data, true);
      toast.success("OTP resent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resend OTP");
    } finally {
      setOtpSending(false);
    }
  };

  const verifyOtpAndRun = async () => {
    if (!otpRequestId || !otpPurpose) return;
    setOtpVerifying(true);
    try {
      const res = await fetch(
        `/api/merchant/staff/action-otp/verify?storeId=${encodeURIComponent(storeId)}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            requestId: otpRequestId,
            otp: otpDigits.replace(/\D/g, "").trim(),
            purpose: otpPurpose,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || data.error || "Invalid OTP");

      if (otpPurpose === "invite" && pendingInvite) {
        const createRes = await fetch(
          `/api/merchant/staff?storeId=${encodeURIComponent(storeId)}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: pendingInvite.name,
              phone_number: pendingInvite.phone,
              role: pendingInvite.role,
            }),
          }
        );
        const created = await createRes.json().catch(() => ({}));
        if (!createRes.ok) throw new Error(created.message || created.error || "Invite failed");
        toast.success("Staff invited");
        setPendingInvite(null);
        setView("home");
        await load();
      } else if (otpPurpose === "remove_staff" && pendingRemove) {
        const delRes = await fetch(
          `/api/merchant/staff/${pendingRemove.id}?storeId=${encodeURIComponent(storeId)}`,
          { method: "DELETE", credentials: "include" }
        );
        const delData = await delRes.json().catch(() => ({}));
        if (!delRes.ok) throw new Error(delData.error || "Remove failed");
        toast.success("Staff removed");
        setPendingRemove(null);
        await load();
      } else if (
        (otpPurpose === "logout_device" || otpPurpose === "logout_all") &&
        pendingLogout
      ) {
        const logoutRes = await fetch(
          `/api/merchant/staff/devices?storeId=${encodeURIComponent(storeId)}`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: pendingLogout.kind === "all" ? "logout_all" : "logout_one",
              device_id: pendingLogout.device_id,
              session_id: pendingLogout.session_id,
              include_current: false,
            }),
          }
        );
        if (!logoutRes.ok) {
          const d = await logoutRes.json().catch(() => ({}));
          throw new Error(d.error || "Logout failed");
        }
        toast.success(pendingLogout.kind === "all" ? "Logged out other devices" : "Device logged out");
        setPendingLogout(null);
        await loadDevices();
      }

      setOtpOpen(false);
      setOtpPurpose(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setOtpVerifying(false);
    }
  };

  const submitInvite = async () => {
    const name = inviteName.trim();
    const phone = onlyDigits(invitePhone);
    if (name.length < 2) {
      toast.error("Enter the invited user's name");
      return;
    }
    if (phone.length !== 10) {
      toast.error("Enter a valid 10-digit mobile number");
      return;
    }
    const ownerDigits = onlyDigits(owner?.registered_phone ?? "");
    if (ownerDigits === phone) {
      toast.error("This number is already registered as the Owner");
      return;
    }
    const existing = staff.find((s) => onlyDigits(s.phone_number) === phone);
    if (existing) {
      toast.error(
        `This number is already invited as ${normalizeStaffRole(existing.role) === "MANAGER" ? "Manager" : "Staff"}`
      );
      return;
    }
    setPendingInvite({ name, phone, role: inviteRole });
    await startOtp("invite");
  };

  const saveOwnerContact = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/merchant/staff/owner-contact?storeId=${encodeURIComponent(storeId)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_name: editName.trim() || undefined,
            owner_email: editEmail.trim() || undefined,
            registered_phone: editPhone.trim() || undefined,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setOwner((prev) => ({ ...(prev ?? ({} as OwnerInfo)), ...data.owner }));
      toast.success("Owner contact updated");
      setView("home");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        You do not have permission to manage staff for this store. Only Owner and Manager roles
        can invite or remove users (same as the merchant app).
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading staff…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {view === "home" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Staff & Access</h3>
              <p className="text-sm text-slate-600">
                Invite managers and staff. Sensitive actions need owner OTP.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPermsRole("OWNER");
                  setPermsOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Eye className="h-4 w-4" />
                View permissions
              </button>
              <button
                type="button"
                onClick={() => void openDevices()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                <UserPlus className="h-4 w-4" />
                Invite user
              </button>
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-indigo-600" />
                <h4 className="text-sm font-semibold text-slate-900">Owner</h4>
              </div>
              {accessRole === "OWNER" ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditName(owner?.owner_name ?? "");
                    setEditPhone(onlyDigits(owner?.registered_phone ?? ""));
                    setEditEmail(owner?.owner_email ?? "");
                    setView("ownerEdit");
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
              ) : null}
            </header>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Name
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {owner?.owner_name || owner?.parent_name || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Phone
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {owner?.registered_phone || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </p>
                <p className="mt-1 break-all text-sm font-semibold text-slate-900">
                  {owner?.owner_email || "—"}
                </p>
              </div>
            </div>
          </section>

          <RoleList
            title="Managers"
            empty="No managers invited yet"
            members={managers}
            onRemove={(s) => {
              setPendingRemove(s);
              void startOtp("remove_staff");
            }}
            onInvite={() => {
              setInviteRole("MANAGER");
              setInviteName("");
              setInvitePhone("");
              setView("invite");
            }}
          />

          <RoleList
            title="Staff"
            empty="No staff invited yet"
            members={staffMembers}
            onRemove={(s) => {
              setPendingRemove(s);
              void startOtp("remove_staff");
            }}
            onInvite={() => {
              setInviteRole("STAFF");
              setInviteName("");
              setInvitePhone("");
              setView("invite");
            }}
          />
        </>
      )}

      {view === "invite" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">
              Invite {inviteRole === "MANAGER" ? "Manager" : "Staff"}
            </h3>
            <button
              type="button"
              onClick={() => setView("home")}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Role</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "MANAGER" | "STAFF")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="MANAGER">Manager</option>
                <option value="STAFF">Staff</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Full name</span>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Name"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">
                Mobile (10 digits)
              </span>
              <input
                value={invitePhone}
                onChange={(e) => setInvitePhone(onlyDigits(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="9876543210"
                inputMode="numeric"
                maxLength={10}
              />
            </label>
            <p className="text-xs text-slate-500">
              Email invites will be enabled soon. Invite by phone for now. Owner OTP confirms the
              invite.
            </p>
            <button
              type="button"
              disabled={saving}
              onClick={() => void submitInvite()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Continue with OTP
            </button>
          </div>
        </div>
      )}

      {view === "ownerEdit" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Edit owner contact</h3>
            <button
              type="button"
              onClick={() => setView("home")}
              className="rounded-lg p-1.5 hover:bg-slate-100"
            >
              <X className="h-5 w-5 text-slate-500" />
            </button>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Name</span>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Phone</span>
              <input
                value={editPhone}
                onChange={(e) => setEditPhone(onlyDigits(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                maxLength={10}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase text-slate-500">Email</span>
              <input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveOwnerContact()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Permissions sidesheet — below top bar */}
      <PartnerSidesheet
        open={permsOpen}
        title="Permissions"
        subtitle="Same role matrix as the merchant app"
        onClose={() => setPermsOpen(false)}
      >
        <div className="mb-4 flex gap-2">
          {STAFF_ROLE_OPTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPermsRole(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                permsRole === r.key
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {STAFF_PERMISSIONS.map((p) => {
            const ok = roleHasPermission(permsRole, p.id);
            return (
              <li
                key={p.id}
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    ok ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-400"
                  }`}
                >
                  {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                  <p className="text-xs text-slate-500">{p.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </PartnerSidesheet>

      {/* Devices sidesheet — user_device_sessions */}
      <PartnerSidesheet
        open={devicesOpen}
        title="Logged-in devices"
        subtitle="All sessions from merchant app and partner site"
        onClose={() => setDevicesOpen(false)}
        wide
        footer={
          <button
            type="button"
            onClick={() => {
              setPendingLogout({ kind: "all" });
              void startOtp("logout_all");
            }}
            className="w-full rounded-xl border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
          >
            Log out all others
          </button>
        }
      >
        {devicesLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading devices…
          </div>
        ) : sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No active devices</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {sessions.map((s) => (
              <li
                key={`d-${s.id}-${s.device_id ?? ""}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {deviceLabel(s)}
                    {s.is_current ? (
                      <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.last_active || s.login_time || "—"}
                  </p>
                </div>
                {!s.is_current ? (
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
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PartnerSidesheet>

      {/* OTP modal */}
      {otpOpen ? (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{otpMeta.title}</h3>
            <p className="mt-1 text-sm text-slate-600">{otpMeta.body}</p>
            <p className="mt-2 whitespace-pre-line text-xs text-slate-500">{otpMeta.masked}</p>
            {otpSending ? (
              <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Sending OTP…
              </div>
            ) : (
              <input
                value={otpDigits}
                onChange={(e) => setOtpDigits(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="mt-4 w-full rounded-xl border border-slate-200 px-3 py-3 text-center text-lg tracking-[0.3em]"
                placeholder="••••••"
                inputMode="numeric"
                maxLength={6}
              />
            )}
            <div className="mt-3 flex items-center justify-between gap-3 text-xs">
              <span
                className={`font-medium ${
                  otpExpirySec <= 0
                    ? "text-red-600"
                    : otpExpirySec <= 60
                      ? "text-amber-700"
                      : "text-slate-500"
                }`}
              >
                {otpExpirySec <= 0
                  ? "OTP expired — resend a new code"
                  : `Expires in ${Math.floor(otpExpirySec / 60)}:${String(otpExpirySec % 60).padStart(2, "0")}`}
              </span>
              {otpResendSec > 0 ? (
                <span className="text-slate-500">Resend OTP in {otpResendSec}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => void resendOtp()}
                  disabled={otpSending || otpVerifying}
                  className="font-semibold text-indigo-600 hover:underline disabled:opacity-50"
                >
                  {otpSending ? "Sending…" : "Resend OTP"}
                </button>
              )}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setOtpOpen(false);
                  setOtpResendSec(0);
                  setOtpExpirySec(0);
                  setPendingInvite(null);
                  setPendingRemove(null);
                  setPendingLogout(null);
                }}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  otpSending ||
                  otpVerifying ||
                  otpDigits.length < 4 ||
                  !otpRequestId ||
                  otpExpirySec <= 0
                }
                onClick={() => void verifyOtpAndRun()}
                className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
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

function RoleList({
  title,
  empty,
  members,
  onRemove,
  onInvite,
}: {
  title: string;
  empty: string;
  members: StaffMember[];
  onRemove: (s: StaffMember) => void;
  onInvite: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-600" />
          <h4 className="text-sm font-semibold text-slate-900">
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
        <p className="px-4 py-6 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{m.name}</p>
                <p className="text-xs text-slate-500">{m.phone_number}</p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(m)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
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
