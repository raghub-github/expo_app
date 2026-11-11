/**
 * Manage staff / Contact details — light UI.
 * Owner · Manager · Staff sections, Invite user, View permissions, Logged-in devices + OTP.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  getStaff,
  createStaff,
  deleteStaff,
  updateOwnerContact,
  sendMerchantActionOtp,
  verifyMerchantActionOtp,
  type MerchantActionOtpPurpose,
  type StaffMember,
} from "@/services/staffApi";
import {
  getUserSessions,
  logoutAllUserSessions,
  logoutUserSessions,
  syncCurrentDeviceCapture,
  type UserDeviceSession,
} from "@/services/userSessionsApi";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";
import { getMerchantDeviceMeta } from "@/lib/merchantDeviceMeta";
import {
  STAFF_PERMISSIONS,
  STAFF_ROLE_OPTIONS,
  normalizeStaffRole,
  partnerHasPermission,
  roleHasPermission,
  type StaffRoleKey,
} from "@/lib/staffPermissions";
import { AuthProxyImage } from "@/components/AuthProxyImage";
import { resolveImageUrl } from "@/services/outletApi";
import { useMerchantGoBack } from "@/lib/merchantNavigation";

const C = {
  bg: "#F8FAFC",
  card: "#FFFFFF",
  cardAlt: "#F1F5F9",
  border: "#E2E8F0",
  section: "#F1F5F9",
  text: "#0F172A",
  textMuted: "#64748B",
  textDim: "#94A3B8",
  blue: "#2D7CF6",
  blueSoft: "#DBEAFE",
  green: "#22C55E",
  red: "#EF4444",
  redSoft: "#DC2626",
  inputBorder: "#CBD5E1",
  btnBlack: "#111111",
  btnDisabled: "#CBD5E1",
};

type PageView = "home" | "invite" | "devices" | "ownerEdit";
type OtpPurpose = "one" | "all" | "remove_staff" | "invite" | null;
type InfoModalState = { title: string; message: string } | null;
type ConfirmModalState = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
} | null;

function parsePgTimestamp(iso: string): Date | null {
  if (!iso) return null;
  const raw = String(iso).trim();
  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d;
  const m =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:([+-]\d{2})(?::?(\d{2}))?)?$/.exec(
      raw
    );
  if (!m) return null;
  const [, y, mo, da, h, mi, s, frac, offH, offM] = m;
  let utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(da),
    Number(h),
    Number(mi),
    Number(s),
    frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0
  );
  if (offH) {
    const sign = offH.startsWith("-") ? -1 : 1;
    const absH = Math.abs(Number(offH));
    const absM = offM ? Number(offM) : 0;
    utcMs -= sign * (absH * 60 + absM) * 60 * 1000;
  }
  return new Date(utcMs);
}

function formatLoginStamp(iso: string): string {
  const d = parsePgTimestamp(iso);
  if (!d) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Strip non-digits; for IN mobiles keep the *last* 10 (so +917367878981 → 7367878981). */
function onlyDigits(v: string): string {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

function toE164In(phone10: string): string {
  const d = onlyDigits(phone10);
  return d.length === 10 ? `+91${d}` : `+91${d}`;
}

function maskPhone(phone: string | null | undefined): string {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length < 4) return "91XXXXXX****";
  const last4 = d.slice(-4);
  return `91XXXXXX${last4}`;
}

function labelFromUserAgent(ua: string | null | undefined): string | null {
  const s = String(ua ?? "").trim();
  if (!s) return null;
  const browser =
    /Edg\//i.test(s) ? "Edge"
    : /Chrome\//i.test(s) && !/Edg\//i.test(s) ? "Chrome"
    : /Firefox\//i.test(s) ? "Firefox"
    : /Safari\//i.test(s) && !/Chrome/i.test(s) ? "Safari"
    : "Browser";
  const os =
    /Windows NT/i.test(s) ? "Windows"
    : /Android/i.test(s) ? "Android"
    : /iPhone|iPad|iPod/i.test(s) ? "iOS"
    : /Mac OS X/i.test(s) ? "macOS"
    : /Linux/i.test(s) ? "Linux"
    : "Web";
  return `${browser} on ${os}`;
}

function deviceFriendlyName(sess: UserDeviceSession): string {
  const source = String(sess.app_source ?? "").toLowerCase();
  const isPartnerSite =
    source === "partnersite" ||
    sess.device_type === "web" ||
    String(sess.login_method ?? "").toLowerCase().includes("partner");

  const rawName = String(sess.device_name ?? "").trim();
  const looksLikeId =
    !rawName ||
    rawName.startsWith("merchant_") ||
    rawName.startsWith("partnersite_") ||
    /^[a-f0-9-]{16,}$/i.test(rawName);

  let core =
    !looksLikeId
      ? rawName
      : labelFromUserAgent(sess.user_agent) ||
        (() => {
          const os = String(sess.os ?? "").trim();
          if (os) return os;
          return isPartnerSite ? "Web browser" : "Mobile device";
        })();

  if (isPartnerSite && !/^partner/i.test(core)) {
    return `Partner site · ${core}`;
  }
  if (source === "merchant_app" && !/merchant app/i.test(core) && sess.device_type !== "web") {
    return core;
  }
  return core;
}

export default function StaffScreen() {
  const router = useRouter();
  const goBack = useMerchantGoBack();
  const insets = useSafeAreaInsets();
  const { selectedStore } = useSelectedStore();
  const { token, partner, signOut, refreshPartner } = useAuth();
  const storeId = selectedStore?.id ?? null;
  const storeLogoUrl = resolveImageUrl(
    selectedStore?.parent_logo_url ?? partner?.parent?.store_logo ?? null
  );

  const [page, setPage] = useState<PageView>("home");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [userSessions, setUserSessions] = useState<UserDeviceSession[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteRole, setInviteRole] = useState<StaffRoleKey>("STAFF");
  const [inviteByEmail, setInviteByEmail] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const [permsVisible, setPermsVisible] = useState(false);
  const [permsRole, setPermsRole] = useState<StaffRoleKey>("OWNER");

  const [otpVisible, setOtpVisible] = useState(false);
  const [otpDigits, setOtpDigits] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResendSec, setOtpResendSec] = useState(0);
  const [otpUi, setOtpUi] = useState<{ title: string; body: string; maskedLine: string }>({
    title: "Verify that it's you",
    body: "We need to verify your account in order to proceed",
    maskedLine: "",
  });
  const otpActionRef = useRef<OtpPurpose>(null);
  const otpSessionIdRef = useRef<number | null>(null);
  const otpRequestIdRef = useRef<string | null>(null);
  const pendingRemoveStaffRef = useRef<StaffMember | null>(null);
  const pendingInviteRef = useRef<{
    name: string;
    phone: string;
    role: StaffRoleKey;
  } | null>(null);
  const otpInputRef = useRef<TextInput>(null);

  const [infoModal, setInfoModal] = useState<InfoModalState>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);

  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editField, setEditField] = useState<"name" | "phone" | "email" | null>(null);

  const parent = partner?.parent;
  const ownerName = parent?.owner_name || parent?.parent_name || "Owner";
  const ownerPhone = parent?.registered_phone || "";
  const ownerEmail = parent?.owner_email || "";
  const storeLabel = selectedStore?.name || selectedStore?.store_name || "Outlet";
  const storeIdLabel = selectedStore?.id != null ? `ID: ${selectedStore.id}` : "";

  const managers = useMemo(
    () => staff.filter((s) => normalizeStaffRole(s.role) === "MANAGER" && s.status !== false),
    [staff]
  );
  const staffMembers = useMemo(
    () => staff.filter((s) => normalizeStaffRole(s.role) === "STAFF" && s.status !== false),
    [staff]
  );
  // Always prefer live sessions list so logout updates Contact details instantly.
  const totalDevices = userSessions.length;

  const load = useCallback(async () => {
    if (!storeId || !token) {
      if (!token) setError("Not signed in.");
      else setError("No store selected.");
      return;
    }
    // Keep Contact details visible — refresh in background (no full-page spinner).
    try {
      const [staffList, deviceId, meta] = await Promise.all([
        getStaff(storeId, token),
        getOrCreateMerchantDeviceId().catch(() => null),
        getMerchantDeviceMeta().catch(() => null),
      ]);
      if (deviceId && meta) {
        await syncCurrentDeviceCapture(token, {
          deviceId,
          deviceName: meta.deviceName,
          deviceOs: meta.os,
          deviceType: meta.deviceType,
          appSource: meta.appSource,
        });
      }
      const userSess = await getUserSessions(token);
      setStaff(staffList);
      setUserSessions(userSess);
      setCurrentDeviceId(deviceId);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load staff details");
    }
  }, [storeId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!partnerHasPermission(partner, "users")) {
      router.replace("/(tabs)/profile" as any);
    }
  }, [partner, router]);

  useEffect(() => {
    if (otpResendSec <= 0) return;
    const id = setInterval(() => setOtpResendSec((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [otpResendSec]);

  const openInvite = (role?: StaffRoleKey) => {
    setInviteRole(role ?? "STAFF");
    setInviteName("");
    setInvitePhone("");
    setInviteEmail("");
    setInviteByEmail(false);
    setPage("invite");
  };

  const phoneLast10 = (raw: string) => onlyDigits(raw).slice(-10);

  const findDuplicatePhoneConflict = (phone10: string): string | null => {
    if (phone10.length !== 10) return null;
    if (phoneLast10(ownerPhone) === phone10) {
      return "This number is already registered as the Owner. Use a different number.";
    }
    const existing = staff.find(
      (s) => s.status !== false && phoneLast10(s.phone_number) === phone10
    );
    if (!existing) return null;
    const roleLabel =
      normalizeStaffRole(existing.role) === "MANAGER" ? "Manager" : "Staff";
    return `This number is already invited as ${roleLabel} (${existing.name}). Each number can only have one role.`;
  };

  const purposeForAction = (action: OtpPurpose): MerchantActionOtpPurpose => {
    if (action === "invite") return "invite";
    if (action === "remove_staff") return "remove_staff";
    if (action === "all") return "logout_all";
    return "logout_device";
  };

  const sendInvite = async () => {
    if (!storeId || !token) return;
    const name = inviteName.trim();
    if (!name || name.length < 2) {
      setInfoModal({ title: "Name required", message: "Enter the invited user's name." });
      return;
    }
    if (inviteByEmail) {
      const email = inviteEmail.trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setInfoModal({ title: "Invalid email", message: "Enter a valid email address." });
        return;
      }
      setInfoModal({
        title: "Email invite",
        message: "Email invites will be enabled soon. Please invite by phone for now.",
      });
      return;
    }
    const phone = onlyDigits(invitePhone);
    if (phone.length !== 10) {
      setInfoModal({ title: "Invalid number", message: "Enter a valid 10-digit mobile number." });
      return;
    }
    const conflict = findDuplicatePhoneConflict(phone);
    if (conflict) {
      setInfoModal({ title: "Number already used", message: conflict });
      return;
    }
    pendingInviteRef.current = { name, phone, role: inviteRole };
    await startOtpFlow("invite");
  };

  const startOtpFlow = async (action: OtpPurpose, sessionId?: number) => {
    if (!token) return;
    if (!ownerPhone) {
      setInfoModal({
        title: "Phone missing",
        message: "Owner phone is required to verify this action.",
      });
      return;
    }
    otpActionRef.current = action;
    otpSessionIdRef.current = sessionId ?? null;
    otpRequestIdRef.current = null;
    setOtpDigits("");
    setOtpVisible(true);
    setOtpSending(true);
    try {
      const sent = await sendMerchantActionOtp(token, purposeForAction(action));
      otpRequestIdRef.current = sent.requestId;
      const channels = [
        sent.maskedPhone,
        sent.maskedEmail,
      ]
        .filter(Boolean)
        .join(" or ");
      setOtpUi({
        title:
          action === "remove_staff"
            ? "Confirm removal"
            : action === "invite"
              ? "Verify that it's you"
              : "Verify that it's you",
        body:
          action === "invite"
            ? "Confirm this invite. OTP is sent to the owner phone and email — not the invited number."
            : action === "remove_staff"
              ? "Enter the OTP sent to the owner phone and email to permanently remove this user."
              : action === "all"
                ? "Enter the OTP sent to the owner phone and email to log out all devices."
                : "We need to verify your account. OTP is sent to the owner phone and email.",
        maskedLine: channels
          ? `Enter the OTP sent on ${channels}`
          : `Enter the OTP sent on ${maskPhone(ownerPhone)}`,
      });
      if (typeof sent.devOtp === "string" && sent.devOtp.length === 6) {
        setOtpDigits(sent.devOtp);
        setOtpUi((prev) => ({
          ...prev,
          maskedLine: `${prev.maskedLine}\nDev OTP (SMS not delivering): ${sent.devOtp}`,
        }));
      }
      setOtpResendSec(30);
      setTimeout(() => otpInputRef.current?.focus(), 250);
    } catch (e) {
      setOtpVisible(false);
      otpActionRef.current = null;
      pendingRemoveStaffRef.current = null;
      pendingInviteRef.current = null;
      setInfoModal({
        title: "OTP failed",
        message: e instanceof Error ? e.message : "Could not send OTP.",
      });
    } finally {
      setOtpSending(false);
    }
  };

  const confirmRemoveStaff = (s: StaffMember) => {
    setConfirmModal({
      title: "Remove user?",
      message: `This will permanently remove ${s.name}'s access. We'll send an OTP to your phone and email to confirm.`,
      confirmLabel: "Continue",
      onConfirm: () => {
        setConfirmModal(null);
        pendingRemoveStaffRef.current = s;
        void startOtpFlow("remove_staff");
      },
    });
  };

  const startOtpForLogout = async (action: "one" | "all", sessionId?: number) => {
    await startOtpFlow(action, sessionId);
  };

  const resendOtp = async () => {
    if (otpResendSec > 0 || !token || !otpActionRef.current) return;
    setOtpSending(true);
    try {
      const sent = await sendMerchantActionOtp(token, purposeForAction(otpActionRef.current));
      otpRequestIdRef.current = sent.requestId;
      const channels = [sent.maskedPhone, sent.maskedEmail].filter(Boolean).join(" or ");
      setOtpUi((prev) => ({
        ...prev,
        maskedLine: channels
          ? typeof sent.devOtp === "string" && sent.devOtp.length === 6
            ? `Enter the OTP sent on ${channels}\nDev OTP (SMS not delivering): ${sent.devOtp}`
            : `Enter the OTP sent on ${channels}`
          : `Enter the OTP sent on ${maskPhone(ownerPhone)}`,
      }));
      if (typeof sent.devOtp === "string" && sent.devOtp.length === 6) {
        setOtpDigits(sent.devOtp);
      }
      setOtpResendSec(30);
    } catch (e) {
      setInfoModal({
        title: "OTP failed",
        message: e instanceof Error ? e.message : "Could not resend OTP.",
      });
    } finally {
      setOtpSending(false);
    }
  };

  const openOwnerEdit = () => {
    setEditName(ownerName);
    setEditPhone(onlyDigits(ownerPhone));
    setEditEmail(ownerEmail);
    setEditField(null);
    setPage("ownerEdit");
  };

  const saveOwnerEdit = async () => {
    if (!token) return;
    const name = editName.trim();
    const phone = onlyDigits(editPhone);
    const email = editEmail.trim();
    if (!name) {
      setInfoModal({ title: "Name required", message: "Enter the owner name." });
      return;
    }
    if (phone.length !== 10) {
      setInfoModal({ title: "Invalid number", message: "Enter a valid 10-digit mobile number." });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInfoModal({ title: "Invalid email", message: "Enter a valid email address." });
      return;
    }
    setSaving(true);
    try {
      await updateOwnerContact(token, {
        owner_name: name,
        owner_email: email,
        registered_phone: toE164In(phone),
      });
      await refreshPartner();
      setPage("home");
      setInfoModal({ title: "Saved", message: "Owner contact details updated." });
    } catch (e) {
      setInfoModal({
        title: "Save failed",
        message: e instanceof Error ? e.message : "Could not update owner details.",
      });
    } finally {
      setSaving(false);
    }
  };

  const completeActionAfterOtp = async () => {
    if (!token) return;
    const action = otpActionRef.current;

    if (action === "invite") {
      const pending = pendingInviteRef.current;
      pendingInviteRef.current = null;
      otpActionRef.current = null;
      if (!pending || !storeId) return;
      setSaving(true);
      try {
        const created = await createStaff(
          storeId,
          {
            name: pending.name,
            phone_number: toE164In(pending.phone),
            role: pending.role,
          },
          token
        );
        setStaff((prev) => [...prev, created]);
        setInviteName("");
        setInvitePhone("");
        setPage("home");
        setInfoModal({
          title: "Invite sent",
          message: `${pending.name} will receive access details. They can sign in with this phone number.`,
        });
      } catch (e) {
        setInfoModal({
          title: "Invite failed",
          message: e instanceof Error ? e.message : "Could not send invite.",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (action === "remove_staff") {
      const target = pendingRemoveStaffRef.current;
      pendingRemoveStaffRef.current = null;
      otpActionRef.current = null;
      if (!target || !storeId) return;
      setSaving(true);
      try {
        await deleteStaff(storeId, target.id, token);
        setStaff((prev) => prev.filter((x) => x.id !== target.id));
        setInfoModal({
          title: "User removed",
          message: `${target.name} has been removed and can no longer sign in.`,
        });
      } catch (e) {
        setInfoModal({
          title: "Remove failed",
          message: e instanceof Error ? e.message : "Could not remove user.",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (action === "one" && otpSessionIdRef.current != null) {
      const targetId = otpSessionIdRef.current;
      const sess = userSessions.find((s) => s.id === targetId);
      const isCurrent =
        !!sess?.device_id &&
        !!currentDeviceId &&
        String(sess.device_id) === String(currentDeviceId);
      otpActionRef.current = null;
      otpSessionIdRef.current = null;
      // Instant UI update, then confirm with server (re-sync if needed).
      setUserSessions((prev) => prev.filter((s) => s.id !== targetId));
      try {
        await logoutUserSessions(token, [targetId]);
        const fresh = await getUserSessions(token).catch(() => null);
        if (fresh) setUserSessions(fresh);
      } catch (e) {
        if (!isCurrent) {
          void load();
          setInfoModal({
            title: "Failed",
            message: e instanceof Error ? e.message : "Could not logout device.",
          });
          return;
        }
      }
      if (isCurrent) {
        await signOut();
        router.replace("/(auth)/login");
      }
      return;
    }
    if (action === "all") {
      otpActionRef.current = null;
      try {
        await logoutAllUserSessions(token, true);
      } catch {
        /* still sign out */
      }
      setUserSessions([]);
      await signOut();
      router.replace("/(auth)/login");
    }
  };

  const verifyOtpAndContinue = async () => {
    if (otpDigits.trim().length < 6 || !token || !otpRequestIdRef.current || !otpActionRef.current) {
      return;
    }
    setOtpVerifying(true);
    try {
      await verifyMerchantActionOtp(token, {
        requestId: otpRequestIdRef.current,
        otp: otpDigits.trim(),
        purpose: purposeForAction(otpActionRef.current),
      });
      setOtpVisible(false);
      otpRequestIdRef.current = null;
      await completeActionAfterOtp();
    } catch (e) {
      setInfoModal({
        title: "Invalid OTP",
        message: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setOtpVerifying(false);
    }
  };

  const inviteReady =
    inviteName.trim().length >= 2 &&
    (!inviteByEmail
      ? onlyDigits(invitePhone).length === 10
      : inviteEmail.trim().includes("@"));

  if (error && !staff.length && !parent) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Ionicons name="alert-circle-outline" size={48} color={C.textDim} />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryChip} onPress={() => void load()}>
          <Text style={styles.retryChipText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {page === "home" ? (
        <HomeView
          ownerName={ownerName}
          ownerPhone={ownerPhone}
          ownerEmail={ownerEmail}
          totalDevices={totalDevices}
          managers={managers}
          staffMembers={staffMembers}
          bottomInset={Math.max(insets.bottom, 12)}
          topInset={insets.top}
          storeLogoUrl={storeLogoUrl}
          token={token}
          onBack={goBack}
          onOpenPermissions={() => {
            setPermsRole("OWNER");
            setPermsVisible(true);
          }}
          onOpenDevices={() => setPage("devices")}
          onInvite={(role) => openInvite(role)}
          onRemove={confirmRemoveStaff}
          onEditOwner={openOwnerEdit}
        />
      ) : null}

      {page === "ownerEdit" ? (
        <OwnerEditView
          topInset={insets.top}
          bottomInset={Math.max(insets.bottom, 12)}
          name={editName}
          phone={editPhone}
          email={editEmail}
          editField={editField}
          saving={saving}
          storeLogoUrl={storeLogoUrl}
          token={token}
          onNameChange={setEditName}
          onPhoneChange={(t) => setEditPhone(onlyDigits(t))}
          onEmailChange={setEditEmail}
          onEditField={setEditField}
          onBack={() => setPage("home")}
          onSave={() => void saveOwnerEdit()}
        />
      ) : null}

      {page === "invite" ? (
        <InviteView
          name={inviteName}
          onNameChange={setInviteName}
          phone={invitePhone}
          onPhoneChange={(t) => setInvitePhone(onlyDigits(t))}
          role={inviteRole}
          onRoleChange={setInviteRole}
          byEmail={inviteByEmail}
          onToggleEmail={() => setInviteByEmail((v) => !v)}
          email={inviteEmail}
          onEmailChange={setInviteEmail}
          saving={saving}
          canSend={!!inviteReady && !saving}
          topInset={insets.top}
          onBack={() => setPage("home")}
          onSend={() => void sendInvite()}
          onOpenPermissions={() => {
            setPermsRole(inviteRole);
            setPermsVisible(true);
          }}
        />
      ) : null}

      {page === "devices" ? (
        <DevicesView
          ownerName={ownerName}
          ownerEmail={ownerEmail}
          storeLabel={storeLabel}
          storeIdLabel={storeIdLabel}
          sessions={userSessions}
          currentDeviceId={currentDeviceId}
          storeLogoUrl={storeLogoUrl}
          token={token}
          topInset={insets.top}
          onBack={() => setPage("home")}
          onLogoutOne={(id) => void startOtpForLogout("one", id)}
          onLogoutAll={() => void startOtpForLogout("all")}
        />
      ) : null}

      <PermissionsSheet
        visible={permsVisible}
        role={permsRole}
        onRoleChange={setPermsRole}
        onClose={() => setPermsVisible(false)}
        bottomInset={Math.max(insets.bottom, 12)}
      />

      <OtpVerifySheet
        visible={otpVisible}
        maskedLine={
          otpUi.maskedLine || `Enter the OTP sent on ${maskPhone(ownerPhone)}`
        }
        digits={otpDigits}
        onDigitsChange={(t) => setOtpDigits(t.replace(/\D/g, "").slice(0, 6))}
        resendSec={otpResendSec}
        sending={otpSending}
        verifying={otpVerifying}
        inputRef={otpInputRef}
        onClose={() => {
          setOtpVisible(false);
          otpActionRef.current = null;
          otpRequestIdRef.current = null;
          pendingRemoveStaffRef.current = null;
          pendingInviteRef.current = null;
        }}
        onResend={() => void resendOtp()}
        onContinue={() => void verifyOtpAndContinue()}
        bottomInset={Math.max(insets.bottom, 16)}
        title={otpUi.title}
        body={otpUi.body}
      />

      <InfoModal
        state={infoModal}
        onClose={() => setInfoModal(null)}
      />
      <ConfirmModal
        state={confirmModal}
        onCancel={() => setConfirmModal(null)}
      />
    </View>
  );
}

/* ─── Home (Contact details) ───────────────────────────────────────── */

function HomeView({
  ownerName,
  ownerPhone,
  ownerEmail,
  totalDevices,
  managers,
  staffMembers,
  bottomInset,
  topInset,
  storeLogoUrl,
  token,
  onBack,
  onOpenPermissions,
  onOpenDevices,
  onInvite,
  onRemove,
  onEditOwner,
}: {
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string;
  totalDevices: number;
  managers: StaffMember[];
  staffMembers: StaffMember[];
  bottomInset: number;
  topInset: number;
  storeLogoUrl: string | null;
  token: string | null;
  onBack: () => void;
  onOpenPermissions: () => void;
  onOpenDevices: () => void;
  onInvite: (role?: StaffRoleKey) => void;
  onRemove: (s: StaffMember) => void;
  onEditOwner: () => void;
}) {
  return (
    <>
      <View style={[styles.contactHeader, { paddingTop: Math.max(topInset, 8) }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <View style={styles.contactHeaderText}>
          <Text style={styles.topTitleLeft}>Contact details</Text>
          <Text style={styles.topSub} numberOfLines={1}>
            Invite users and manage access.
          </Text>
        </View>
        <Pressable onPress={onOpenPermissions} hitSlop={8} style={styles.headerPermBtn}>
          <Text style={styles.topLink}>View permissions</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 100 + bottomInset }]}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>Owner</SectionLabel>
        <View style={styles.personCard}>
          <View style={styles.avatar}>
            {storeLogoUrl && token ? (
              <AuthProxyImage
                uri={storeLogoUrl}
                token={token}
                style={styles.avatarImg}
                resizeMode="cover"
                accessibilityLabel="Store logo"
              />
            ) : (
              <Ionicons name="person" size={22} color={C.textMuted} />
            )}
          </View>
          <View style={styles.personBody}>
            <Text style={styles.personName}>{ownerName}</Text>
            {!!ownerPhone && <Text style={styles.personLine}>{ownerPhone}</Text>}
            {!!ownerEmail && <Text style={styles.personLine}>{ownerEmail}</Text>}
            <Pressable style={styles.devicesLinkRow} onPress={onOpenDevices}>
              <Text style={styles.devicesLink}>
                Logged in {totalDevices} device{totalDevices === 1 ? "" : "s"}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={C.blue} />
            </Pressable>
          </View>
          <Pressable onPress={onEditOwner} hitSlop={10} style={styles.editBtn}>
            <Ionicons name="pencil" size={16} color={C.blue} />
          </Pressable>
        </View>

        <SectionLabel>Manager</SectionLabel>
        {managers.length === 0 ? (
          <EmptyInviteRow
            message="No one added as manager yet."
            onInvite={() => onInvite("MANAGER")}
          />
        ) : (
          managers.map((s) => (
            <StaffRow key={s.id} member={s} onRemove={() => onRemove(s)} />
          ))
        )}

        <SectionLabel>Staff</SectionLabel>
        {staffMembers.length === 0 ? (
          <EmptyInviteRow
            message="No one added as staff yet."
            onInvite={() => onInvite("STAFF")}
          />
        ) : (
          staffMembers.map((s) => (
            <StaffRow key={s.id} member={s} onRemove={() => onRemove(s)} />
          ))
        )}
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: 16 + bottomInset }]}>
        <Pressable style={styles.fab} onPress={() => onInvite("STAFF")}>
          <Text style={styles.fabText}>Invite user</Text>
        </Pressable>
      </View>
    </>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <View style={styles.sectionBanner}>
      <Text style={styles.sectionBannerText}>{children}</Text>
    </View>
  );
}

function EmptyInviteRow({ message, onInvite }: { message: string; onInvite: () => void }) {
  return (
    <View style={styles.emptyBlock}>
      <Text style={styles.emptyMsg}>{message}</Text>
      <Pressable onPress={onInvite}>
        <Text style={styles.inviteNow}>Invite someone now</Text>
      </Pressable>
    </View>
  );
}

function StaffRow({ member, onRemove }: { member: StaffMember; onRemove: () => void }) {
  return (
    <View style={styles.personCard}>
      <View style={styles.avatar}>
        <Ionicons name="person" size={20} color={C.textMuted} />
      </View>
      <View style={styles.personBody}>
        <Text style={styles.personName}>{member.name}</Text>
        <Text style={styles.personLine}>{member.phone_number}</Text>
      </View>
      <Pressable onPress={onRemove} hitSlop={10} style={styles.editBtn}>
        <Ionicons name="trash-outline" size={16} color={C.redSoft} />
      </Pressable>
    </View>
  );
}

/* ─── Invite user ──────────────────────────────────────────────────── */

function InviteView({
  name,
  onNameChange,
  phone,
  onPhoneChange,
  role,
  onRoleChange,
  byEmail,
  onToggleEmail,
  email,
  onEmailChange,
  saving,
  canSend,
  topInset,
  onBack,
  onSend,
  onOpenPermissions,
}: {
  name: string;
  onNameChange: (t: string) => void;
  phone: string;
  onPhoneChange: (t: string) => void;
  role: StaffRoleKey;
  onRoleChange: (r: StaffRoleKey) => void;
  byEmail: boolean;
  onToggleEmail: () => void;
  email: string;
  onEmailChange: (t: string) => void;
  saving: boolean;
  canSend: boolean;
  topInset: number;
  onBack: () => void;
  onSend: () => void;
  onOpenPermissions: () => void;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBar, { paddingTop: Math.max(topInset, 8) }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.topTitle}>Invite user</Text>
        <Pressable onPress={onOpenPermissions} hitSlop={8}>
          <Text style={styles.topLink}>View permissions</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.inviteScroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.phoneField, styles.inviteFieldGap]}>
          <TextInput
            style={styles.phoneInputFlex}
            value={name}
            onChangeText={onNameChange}
            placeholder="Full name"
            placeholderTextColor={C.textDim}
            autoCapitalize="words"
            maxLength={80}
          />
        </View>

        {byEmail ? (
          <View style={styles.phoneField}>
            <TextInput
              style={styles.phoneInputFlex}
              value={email}
              onChangeText={onEmailChange}
              placeholder="Enter email address"
              placeholderTextColor={C.textDim}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        ) : (
          <View style={styles.phoneField}>
            <View style={styles.ccRow}>
              <Text style={styles.flag}>🇮🇳</Text>
              <Text style={styles.ccText}>+91</Text>
              <Ionicons name="chevron-down" size={14} color={C.textMuted} />
            </View>
            <TextInput
              style={styles.phoneInputFlex}
              value={phone}
              onChangeText={onPhoneChange}
              placeholder="Enter phone number"
              placeholderTextColor={C.textDim}
              keyboardType="number-pad"
              maxLength={10}
            />
          </View>
        )}

        <Text style={styles.helper}>
          {byEmail
            ? "This user will receive an email invite to join your outlet."
            : "This user will receive a link by SMS which they need to click on to accept the invite and be added to your outlet."}
        </Text>
        <Pressable onPress={onToggleEmail}>
          <Text style={styles.inviteAlt}>
            {byEmail ? "Invite by phone" : "Invite by email"}
          </Text>
        </Pressable>

        <View style={styles.roleBanner}>
          <Text style={styles.roleBannerText}>Select user role</Text>
        </View>
        {(["STAFF", "MANAGER"] as StaffRoleKey[]).map((r, idx) => (
          <Pressable
            key={r}
            style={[styles.roleRow, idx > 0 && styles.roleRowBorder]}
            onPress={() => onRoleChange(r)}
          >
            <Text style={styles.roleRowLabel}>
              {r === "STAFF" ? "Staff" : "Manager"}
            </Text>
            <View style={[styles.radio, role === r && styles.radioOn]}>
              {role === r ? <View style={styles.radioDot} /> : null}
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.inviteFooter}>
        <Pressable
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          disabled={!canSend}
          onPress={onSend}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>Send invite</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ─── Logged in devices ────────────────────────────────────────────── */

function DevicesView({
  ownerName,
  ownerEmail,
  storeLabel,
  storeIdLabel,
  sessions,
  currentDeviceId,
  storeLogoUrl,
  token,
  topInset,
  onBack,
  onLogoutOne,
  onLogoutAll,
}: {
  ownerName: string;
  ownerEmail: string;
  storeLabel: string;
  storeIdLabel: string;
  sessions: UserDeviceSession[];
  currentDeviceId: string | null;
  storeLogoUrl: string | null;
  token: string | null;
  topInset: number;
  onBack: () => void;
  onLogoutOne: (id: number) => void;
  onLogoutAll: () => void;
}) {
  return (
    <>
      <View style={[styles.topBarLeft, { paddingTop: Math.max(topInset, 8) }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.topTitleLeft}>Logged in devices</Text>
          <Text style={styles.topSub} numberOfLines={1}>
            {[storeIdLabel, storeLabel].filter(Boolean).join(" • ")}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.devicesScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.deviceProfileCard}>
          <View style={styles.avatar}>
            {storeLogoUrl && token ? (
              <AuthProxyImage
                uri={storeLogoUrl}
                token={token}
                style={styles.avatarImg}
                resizeMode="cover"
                accessibilityLabel="Store logo"
              />
            ) : (
              <Ionicons name="person" size={22} color={C.textMuted} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.personName}>{ownerName}</Text>
            {!!ownerEmail && <Text style={styles.personLine}>{ownerEmail}</Text>}
          </View>
        </View>

        <View style={styles.devicesHeaderRow}>
          <Text style={styles.devicesCount}>Devices ({sessions.length})</Text>
          {sessions.length > 0 ? (
            <Pressable onPress={onLogoutAll}>
              <Text style={styles.logoutAllLink}>Log-out all</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.devicesListCard}>
          {sessions.length === 0 ? (
            <Text style={styles.emptyMsg}>No active devices</Text>
          ) : (
            sessions.map((sess, idx) => {
              const isCurrent =
                !!sess.device_id &&
                !!currentDeviceId &&
                String(sess.device_id) === String(currentDeviceId);
              return (
                <View
                  key={sess.id}
                  style={[styles.deviceRow, idx > 0 && styles.deviceRowBorder]}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={styles.deviceName}>
                      {deviceFriendlyName(sess)}
                      {isCurrent ? " (this device)" : ""}
                    </Text>
                    <Text style={styles.deviceMeta}>
                      Logged in on {formatLoginStamp(sess.login_time)}
                    </Text>
                  </View>
                  <Pressable
                    style={styles.logoutRowBtn}
                    onPress={() => onLogoutOne(sess.id)}
                  >
                    <Ionicons name="log-out-outline" size={16} color={C.redSoft} />
                    <Text style={styles.logoutRowText}>Log-out</Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </>
  );
}

/* ─── View permissions sheet ───────────────────────────────────────── */

function PermissionsSheet({
  visible,
  role,
  onRoleChange,
  onClose,
  bottomInset,
}: {
  visible: boolean;
  role: StaffRoleKey;
  onRoleChange: (r: StaffRoleKey) => void;
  onClose: () => void;
  bottomInset: number;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={styles.sheetDim} onPress={onClose} />
        <View style={[styles.sheetCard, { paddingBottom: bottomInset + 8 }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>View permissions</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={C.text} />
            </Pressable>
          </View>

          <View style={styles.roleTabs}>
            {STAFF_ROLE_OPTIONS.map((opt) => {
              const on = opt.key === role;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.roleTab, on && styles.roleTabOn]}
                  onPress={() => onRoleChange(opt.key)}
                >
                  <MaterialCommunityIcons
                    name={
                      opt.key === "OWNER"
                        ? "account-group"
                        : opt.key === "MANAGER"
                          ? "account-cog"
                          : "account-multiple"
                    }
                    size={22}
                    color={on ? "#fff" : C.textMuted}
                  />
                  <Text style={[styles.roleTabLabel, on && styles.roleTabLabelOn]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            style={styles.permScroll}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
          >
            {STAFF_PERMISSIONS.map((p, idx) => {
              const allowed = roleHasPermission(role, p.id);
              return (
                <View
                  key={p.id}
                  style={[styles.permRow, idx > 0 && styles.permRowBorder]}
                >
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={[styles.permTitle, !allowed && styles.permTitleOff]}>
                      {p.title}
                    </Text>
                    <Text style={styles.permDesc}>{p.description}</Text>
                  </View>
                  <View
                    style={[
                      styles.permBadge,
                      allowed ? styles.permBadgeOn : styles.permBadgeOff,
                    ]}
                  >
                    <Ionicons
                      name={allowed ? "checkmark" : "close"}
                      size={14}
                      color="#fff"
                    />
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ─── OTP verify sheet ─────────────────────────────────────────────── */

function OtpVerifySheet({
  visible,
  maskedLine,
  digits,
  onDigitsChange,
  resendSec,
  sending,
  verifying,
  inputRef,
  onClose,
  onResend,
  onContinue,
  bottomInset,
  title,
  body,
}: {
  visible: boolean;
  maskedLine: string;
  digits: string;
  onDigitsChange: (t: string) => void;
  resendSec: number;
  sending: boolean;
  verifying: boolean;
  inputRef: React.RefObject<TextInput | null>;
  onClose: () => void;
  onResend: () => void;
  onContinue: () => void;
  bottomInset: number;
  title?: string;
  body?: string;
}) {
  const ready = digits.length === 6 && !verifying && !sending;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => {}}>
      <View style={styles.sheetRoot}>
        {/* Backdrop does not dismiss — close only via X. */}
        <View style={styles.sheetDim} pointerEvents="auto" />
        <View style={styles.otpCloseFloat}>
          <Pressable
            style={styles.otpCloseBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
        </View>
        <View style={[styles.otpSheet, { paddingBottom: bottomInset + 12 }]}>
          <Text style={styles.otpTitle}>{title || "Verify that it's you"}</Text>
          <Text style={styles.otpBody}>
            {body || "We need to verify your account in order to proceed"}
          </Text>
          <Text style={styles.otpBody}>{maskedLine}</Text>

          <Pressable style={styles.otpBoxes} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.otpBox}>
                <Text style={styles.otpDigit}>{digits[i] ?? ""}</Text>
                <View style={styles.otpUnderline} />
              </View>
            ))}
            <TextInput
              ref={inputRef}
              value={digits}
              onChangeText={onDigitsChange}
              keyboardType="number-pad"
              maxLength={6}
              style={styles.otpHiddenInput}
              caretHidden
              autoFocus
            />
          </Pressable>

          <View style={styles.otpResendRow}>
            {resendSec > 0 ? (
              <Text style={styles.otpResend}>Resend OTP in {resendSec} secs</Text>
            ) : (
              <Pressable onPress={onResend} disabled={sending}>
                <Text style={styles.otpResendActive}>
                  {sending ? "Sending…" : "Resend OTP"}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable
            style={[styles.sendBtn, !ready && styles.sendBtnDisabled]}
            disabled={!ready}
            onPress={onContinue}
          >
            {verifying ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>Continue</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Owner edit (Zomato-style, light, no delete account) ──────────── */

function OwnerEditView({
  topInset,
  bottomInset,
  name,
  phone,
  email,
  editField,
  saving,
  storeLogoUrl,
  token,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onEditField,
  onBack,
  onSave,
}: {
  topInset: number;
  bottomInset: number;
  name: string;
  phone: string;
  email: string;
  editField: "name" | "phone" | "email" | null;
  saving: boolean;
  storeLogoUrl: string | null;
  token: string | null;
  onNameChange: (t: string) => void;
  onPhoneChange: (t: string) => void;
  onEmailChange: (t: string) => void;
  onEditField: (f: "name" | "phone" | "email" | null) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBarLeft, { paddingTop: Math.max(topInset, 8) }]}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </Pressable>
        <Text style={styles.topTitleLeft}>Contact details</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.ownerPhotoRow}>
          <View style={styles.ownerPhoto}>
            {storeLogoUrl && token ? (
              <AuthProxyImage
                uri={storeLogoUrl}
                token={token}
                style={styles.ownerPhotoImg}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="person" size={36} color={C.textMuted} />
            )}
          </View>
        </View>

        <OutlinedField
          label="Name"
          value={name}
          editable={editField === "name"}
          onChangeText={onNameChange}
          onPressEdit={() => onEditField(editField === "name" ? null : "name")}
        />
        <OutlinedField
          label="Phone number"
          value={phone}
          editable={editField === "phone"}
          onChangeText={onPhoneChange}
          keyboardType="number-pad"
          maxLength={10}
          onPressEdit={() => onEditField(editField === "phone" ? null : "phone")}
        />
        <OutlinedField
          label="Email"
          value={email}
          editable={editField === "email"}
          onChangeText={onEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
          onPressEdit={() => onEditField(editField === "email" ? null : "email")}
        />
      </ScrollView>

      <View style={[styles.inviteFooter, { paddingBottom: bottomInset }]}>
        <Pressable
          style={[styles.sendBtn, saving && styles.sendBtnDisabled]}
          disabled={saving}
          onPress={onSave}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendBtnText}>Save</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function OutlinedField({
  label,
  value,
  editable,
  onChangeText,
  onPressEdit,
  keyboardType,
  maxLength,
  autoCapitalize,
}: {
  label: string;
  value: string;
  editable: boolean;
  onChangeText: (t: string) => void;
  onPressEdit: () => void;
  keyboardType?: "default" | "number-pad" | "email-address";
  maxLength?: number;
  autoCapitalize?: "none" | "sentences";
}) {
  return (
    <View style={styles.outlinedField}>
      <Text style={styles.outlinedLabel}>{label}</Text>
      <View style={styles.outlinedRow}>
        <TextInput
          style={styles.outlinedInput}
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          placeholderTextColor={C.textDim}
        />
        <Pressable onPress={onPressEdit} hitSlop={10} style={styles.outlinedEditBtn}>
          <Ionicons name="pencil" size={16} color={C.blue} />
        </Pressable>
      </View>
    </View>
  );
}

function InfoModal({
  state,
  onClose,
}: {
  state: InfoModalState;
  onClose: () => void;
}) {
  if (!state) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalDim} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{state.title}</Text>
          <Text style={styles.modalMsg}>{state.message}</Text>
          <Pressable style={styles.modalPrimaryBtn} onPress={onClose}>
            <Text style={styles.modalPrimaryText}>OK</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ConfirmModal({
  state,
  onCancel,
}: {
  state: ConfirmModalState;
  onCancel: () => void;
}) {
  if (!state) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalDim} onPress={onCancel} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{state.title}</Text>
          <Text style={styles.modalMsg}>{state.message}</Text>
          <View style={styles.modalActions}>
            <Pressable style={styles.modalGhostBtn} onPress={onCancel}>
              <Text style={styles.modalGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.modalPrimaryBtn}
              onPress={() => {
                state.onConfirm();
              }}
            >
              <Text style={styles.modalPrimaryText}>{state.confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/* ─── Styles ───────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  centered: { justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { marginTop: 12, color: C.textMuted, fontSize: 14 },
  errorText: { marginTop: 12, color: C.textMuted, fontSize: 15, textAlign: "center" },
  retryChip: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: C.btnBlack,
  },
  retryChipText: { color: "#fff", fontWeight: "700" },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  topBarLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  contactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  contactHeaderText: { flex: 1, minWidth: 0 },
  headerLogoWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: C.cardAlt,
  },
  headerLogo: { width: 36, height: 36 },
  headerPermBtn: { paddingLeft: 4, maxWidth: 120 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  topTitle: { color: C.text, fontSize: 17, fontWeight: "700" },
  topTitleLeft: { color: C.text, fontSize: 17, fontWeight: "700" },
  topSub: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  topLink: { color: C.blue, fontSize: 13, fontWeight: "600" },

  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

  sectionBanner: {
    backgroundColor: C.section,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 8,
  },
  sectionBannerText: { color: C.textMuted, fontSize: 13, fontWeight: "600" },

  personCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 44, height: 44 },
  personBody: { flex: 1, minWidth: 0 },
  personName: { color: C.text, fontSize: 15, fontWeight: "700" },
  personLine: { color: C.textMuted, fontSize: 13, marginTop: 2 },
  devicesLinkRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 6 },
  devicesLink: { color: C.blue, fontSize: 13, fontWeight: "600" },
  editBtn: { padding: 6 },

  emptyBlock: { backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 18 },
  emptyMsg: { color: C.textMuted, fontSize: 13 },
  inviteNow: { color: C.blue, fontSize: 13, fontWeight: "700", marginTop: 8 },

  fabWrap: { position: "absolute", right: 16, left: 16 },
  fab: {
    backgroundColor: C.btnBlack,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  fabText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  inviteScroll: { padding: 16, paddingBottom: 120 },
  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 52,
    backgroundColor: C.card,
  },
  /** Space between Full name and phone/email on Invite user. */
  inviteFieldGap: {
    marginBottom: 14,
  },
  ccRow: { flexDirection: "row", alignItems: "center", gap: 4, marginRight: 10 },
  flag: { fontSize: 16 },
  ccText: { color: C.text, fontSize: 15, fontWeight: "600" },
  phoneInputFlex: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 12 },
  helper: { color: C.textDim, fontSize: 12, marginTop: 10, lineHeight: 17 },
  inviteAlt: { color: C.blue, fontSize: 13, fontWeight: "700", marginTop: 12 },
  roleBanner: {
    backgroundColor: C.section,
    marginHorizontal: -16,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  roleBannerText: { color: C.text, fontSize: 14, fontWeight: "700" },
  roleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    backgroundColor: C.card,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  roleRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  roleRowLabel: { color: C.text, fontSize: 15, fontWeight: "600" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.textDim,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOn: { borderColor: C.blue },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.blue },
  inviteFooter: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  sendBtn: {
    backgroundColor: C.btnBlack,
    borderRadius: 10,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: C.btnDisabled },
  sendBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  devicesScroll: { padding: 16, paddingBottom: 40 },
  deviceProfileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  devicesHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  devicesCount: { color: C.text, fontSize: 15, fontWeight: "700" },
  logoutAllLink: { color: C.redSoft, fontSize: 13, fontWeight: "700" },
  devicesListCard: {
    backgroundColor: C.card,
    borderRadius: 12,
    overflow: "hidden",
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  deviceRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  deviceName: { color: C.text, fontSize: 14, fontWeight: "700" },
  deviceMeta: { color: C.textMuted, fontSize: 12, marginTop: 4 },
  logoutRowBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  logoutRowText: { color: C.redSoft, fontSize: 13, fontWeight: "700" },

  sheetRoot: { flex: 1, justifyContent: "flex-end" },
  sheetDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  sheetCard: {
    backgroundColor: C.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "94%",
    minHeight: "72%",
    paddingTop: 8,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sheetTitle: { color: C.text, fontSize: 17, fontWeight: "700" },
  roleTabs: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: C.bg,
    borderRadius: 12,
    padding: 6,
  },
  roleTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  roleTabOn: { backgroundColor: C.blue },
  roleTabLabel: { color: C.textMuted, fontSize: 12, fontWeight: "700" },
  roleTabLabelOn: { color: "#fff" },
  permScroll: { maxHeight: 560, paddingHorizontal: 16 },
  permRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  permRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  permTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
  permTitleOff: { color: C.textDim },
  permDesc: { color: C.textMuted, fontSize: 12, marginTop: 3 },
  permBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  permBadgeOn: { backgroundColor: C.green },
  permBadgeOff: { backgroundColor: "#52525B" },

  otpCloseFloat: { alignItems: "center", marginBottom: 10 },
  otpCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  otpSheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  otpTitle: {
    color: C.text,
    fontSize: 18,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 14,
  },
  otpBody: { color: C.textMuted, fontSize: 13, marginBottom: 4 },
  otpBoxes: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
    marginBottom: 10,
    position: "relative",
  },
  otpBox: { width: 40, alignItems: "center" },
  otpDigit: { color: C.text, fontSize: 22, fontWeight: "700", minHeight: 28 },
  otpUnderline: { width: "100%", height: 2, backgroundColor: C.inputBorder, marginTop: 4 },
  otpHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
  },
  otpResendRow: { alignItems: "flex-end", marginBottom: 18 },
  otpResend: { color: C.textDim, fontSize: 12 },
  otpResendActive: { color: C.blue, fontSize: 12, fontWeight: "700" },

  ownerPhotoRow: { alignItems: "center", marginBottom: 28, marginTop: 8 },
  ownerPhoto: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: C.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ownerPhotoImg: { width: 88, height: 88 },
  outlinedField: {
    borderWidth: 1,
    borderColor: C.inputBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    marginBottom: 16,
    backgroundColor: C.card,
  },
  outlinedLabel: {
    position: "absolute",
    top: -8,
    left: 12,
    paddingHorizontal: 4,
    backgroundColor: C.bg,
    color: C.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  outlinedRow: { flexDirection: "row", alignItems: "center" },
  outlinedInput: {
    flex: 1,
    color: C.text,
    fontSize: 15,
    fontWeight: "600",
    paddingVertical: 8,
  },
  outlinedEditBtn: { padding: 6 },

  modalRoot: { flex: 1, justifyContent: "center", paddingHorizontal: 28 },
  modalDim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  modalCard: {
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 20,
    zIndex: 2,
  },
  modalTitle: { color: C.text, fontSize: 17, fontWeight: "800", marginBottom: 8 },
  modalMsg: { color: C.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 18 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  modalGhostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modalGhostText: { color: C.textMuted, fontWeight: "700", fontSize: 14 },
  modalPrimaryBtn: {
    backgroundColor: C.btnBlack,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  modalPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
