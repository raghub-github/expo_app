'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  Calendar,
  Camera,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Mail,
  MapPin,
  Megaphone,
  Pencil,
  Phone,
  Settings,
  Store,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { useMerchantSession } from '@/context/MerchantSessionContext';
import { usePartnerShellHeader } from '@/context/PartnerShellHeaderContext';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { PartnerToggleConfirmModal } from '@/components/PartnerToggleConfirmModal';
import { StoreOperationalFlowModals } from '@/components/StoreOperationalFlowModals';
import { RadarLiveIndicator } from '@/components/RadarLiveIndicator';
import {
  PartnerWaitingOrderSync,
  notificationListHasWaiting,
} from '@/components/PartnerWaitingOrderSync';
import { WAITING_FOR_ORDER_TITLE } from '@/lib/partner-notification-constants';
import { clientStoreOpsDebugLog } from '@/lib/store-ops-client-debug';
import { toStoredDocumentUrl } from '@/lib/r2';
import NeedHelpBadge from '@/components/NeedHelpBadge';
import { usePartnerDeviceOrderAlerts } from '@/hooks/usePartnerDeviceOrderAlerts';
import {
  migrateDeviceOrderAlertsFromServer,
  syncFoodOrdersUiNotifyFromDevice,
} from '@/lib/partner-device-order-alerts';

type PartnerSheetStoreSettings = {
  show_floating_orders: boolean;
  communication_settings: {
    whatsapp_notifications: boolean;
    reports: {
      daily_whatsapp: boolean;
      daily_email: boolean;
      weekly_whatsapp: boolean;
      weekly_email: boolean;
    };
    live_complaint_notifications: boolean;
    rider_notifications: boolean;
  };
};

const DEFAULT_PARTNER_SHEET_STORE_SETTINGS: PartnerSheetStoreSettings = {
  show_floating_orders: true,
  communication_settings: {
    whatsapp_notifications: false,
    reports: {
      daily_whatsapp: false,
      daily_email: false,
      weekly_whatsapp: false,
      weekly_email: false,
    },
    live_complaint_notifications: false,
    rider_notifications: false,
  },
};

export type PartnerHeaderSheet = 'notifications' | 'settings' | 'status';

type PendingOutletToggle =
  | { kind: 'autoOpen'; storeId: string; nextEnabled: boolean }
  | { kind: 'manualLock'; storeId: string; nextEnabled: boolean };

const SCHEDULE_OFF_REASONS = [
  'Renovation or relocation of restaurant',
  'Closed due to festival',
  'Staff availability issues',
  'Going out of station',
  'Other',
] as const;

function combineLocalDateTime(dateStr: string, timeStr: string): Date | null {
  if (!dateStr || !timeStr) return null;
  const [y, mo, d] = dateStr.split('-').map((x) => parseInt(x, 10));
  const [hh, mm] = timeStr.split(':').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

/** dd-mm-yyyy for schedule-off UI (matches design copy). */
function formatScheduleDateDdMmYyyy(isoDate: string): string {
  const t = (isoDate || '').trim();
  if (!t) return '';
  const [y, m, d] = t.split('-');
  if (!y || !m || !d) return t;
  return `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
}

/** Chromium shrinks hit-testing on opacity-0 date/time inputs to the tiny native icon—open via showPicker from a full-area button instead. */
function openScheduleNativePicker(input: HTMLInputElement | null) {
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') {
      void input.showPicker();
      return;
    }
  } catch {
    /* fall through */
  }
  try {
    input.focus({ preventScroll: true });
    input.click();
  } catch {
    /* ignore */
  }
}

function ScheduleOffDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();

  return (
    <div>
      <p id={labelId} className="mb-1.5 text-xs font-normal text-gray-500">
        {label}
      </p>
      {/*
        Input stays absolute inset-0 for correct picker anchoring (not fixed top-left).
        Transparent button captures the whole row; native input is pointer-events-none so Chrome's tiny icon-only hit target does not apply.
      */}
      <div className="relative w-full rounded-xl">
        <div className="pointer-events-none relative flex h-11 min-h-[44px] w-full items-center rounded-xl border border-gray-300 bg-white shadow-sm">
          <Calendar
            className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <span
            className={`absolute left-10 right-10 truncate text-sm ${
              value ? 'font-normal text-gray-900' : 'text-gray-400'
            }`}
          >
            {value ? formatScheduleDateDdMmYyyy(value) : 'Select date'}
          </span>
          <ChevronDown
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
        </div>
        <input
          ref={inputRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] h-full min-h-[44px] w-full opacity-0"
        />
        <button
          type="button"
          aria-labelledby={labelId}
          className="absolute inset-0 z-[2] m-0 cursor-pointer rounded-xl border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          onClick={() => openScheduleNativePicker(inputRef.current)}
        />
      </div>
    </div>
  );
}

function ScheduleOffTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();

  return (
    <div>
      <p id={labelId} className="mb-1.5 text-xs font-normal text-gray-500">
        {label}
      </p>
      <div className="relative w-full rounded-xl">
        <div className="pointer-events-none relative flex h-11 min-h-[44px] w-full items-center rounded-xl border border-gray-300 bg-white shadow-sm">
          <Clock
            className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400"
            aria-hidden
          />
          <span
            className={`absolute left-10 right-10 truncate text-sm ${
              value ? 'font-normal text-gray-900' : 'text-gray-400'
            }`}
          >
            {value ? value : 'Select time'}
          </span>
          <ChevronDown
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden
          />
        </div>
        <input
          ref={inputRef}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[1] h-full min-h-[44px] w-full opacity-0"
        />
        <button
          type="button"
          aria-labelledby={labelId}
          className="absolute inset-0 z-[2] m-0 cursor-pointer rounded-xl border-0 bg-transparent p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          onClick={() => openScheduleNativePicker(inputRef.current)}
        />
      </div>
    </div>
  );
}

type StoreOpRow = {
  open: boolean | null;
  autoOpen: boolean;
  manualLock: boolean;
  /** From GET /api/store-operations — current time inside an active slot (or 24h). */
  withinOperatingHours?: boolean | null;
  /** From GET — today is a scheduled closed day or has no valid slots while "open" in DB. */
  todayScheduledClosed?: boolean | null;
};

function WhatsappBrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function CompactSwitch({
  on,
  disabled,
  onToggle,
  ariaLabel,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onToggle}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/** Store banner thumbnail for outlet rows (merchant_stores.banner_url — proxy or R2 URL). */
function OutletBannerThumb({ url }: { url: string | null | undefined }) {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const isBroken = !!trimmed && brokenUrl === trimmed;
  if (!trimmed || isBroken) {
    return (
      <div
        className="h-14 w-14 shrink-0 rounded-md bg-gradient-to-br from-slate-100 to-slate-200/90"
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trimmed}
      alt=""
      className="h-14 w-14 shrink-0 rounded-md border border-slate-200/80 bg-slate-100 object-cover"
      onError={() => setBrokenUrl(trimmed)}
    />
  );
}

interface MXPartnerTopBarProps {
  restaurantName?: string;
  restaurantId?: string;
  sidebarCollapsed: boolean;
  /** Page heading in the top bar (replaces in-content title on some pages) */
  headerTitle?: string;
  /** When true, hides the Need a hand link in header */
  hideHelpBadge?: boolean;
}

export const MXPartnerTopBar: React.FC<MXPartnerTopBarProps> = ({
  restaurantName = 'Store',
  restaurantId,
  sidebarCollapsed,
  headerTitle,
  hideHelpBadge = false,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const merchantSession = useMerchantSession();
  const userEmail = merchantSession?.user?.email ?? merchantSession?.user?.phone ?? '';

  /** SSR-safe: only props on first paint; localStorage merged after mount (fixes hydration). */
  const [resolvedStoreId, setResolvedStoreId] = useState(() => (restaurantId || '').trim());
  const [storeList, setStoreList] = useState<
    Array<{ store_id: string; store_name: string; full_address: string; banner_url?: string | null }>
  >([]);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [parentName, setParentName] = useState<string | null>(null);
  const [ownerEmailResolved, setOwnerEmailResolved] = useState<string | null>(null);
  const [brokenAvatarSrc, setBrokenAvatarSrc] = useState<string | null>(null);

  const [sheet, setSheet] = useState<PartnerHeaderSheet | null>(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [photoActionMenuOpen, setPhotoActionMenuOpen] = useState(false);
  const [localAvatarDataUrl, setLocalAvatarDataUrl] = useState<string | null>(null);
  const [profilePanelPos, setProfilePanelPos] = useState<{
    top: number;
    right: number;
    width: number;
  } | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profilePanelRef = useRef<HTMLDivElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const partnerShellHeader = usePartnerShellHeader();
  const topbarRef = useRef<HTMLElement | null>(null);
  const [statusTab, setStatusTab] = useState<'manage' | 'schedule'>('manage');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const [autoOpenFromSchedule, setAutoOpenFromSchedule] = useState(true);
  const [manualLock, setManualLock] = useState(false);
  const [storeOpsById, setStoreOpsById] = useState<Record<string, StoreOpRow>>({});
  const prevSheetRef = useRef<PartnerHeaderSheet | null>(null);
  const [scheduleClosures, setScheduleClosures] = useState<
    Array<{ id: number; reason: string; starts_at: string; ends_at: string; status: string }>
  >([]);
  const [scheduleStorePick, setScheduleStorePick] = useState('');
  const [schedStartDate, setSchedStartDate] = useState('');
  const [schedStartTime, setSchedStartTime] = useState('');
  const [schedEndDate, setSchedEndDate] = useState('');
  const [schedEndTime, setSchedEndTime] = useState('');
  const [schedReason, setSchedReason] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<PendingOutletToggle | null>(null);
  const [toggleConfirmLoading, setToggleConfirmLoading] = useState(false);
  const [parentPhotoBusy, setParentPhotoBusy] = useState(false);
  /** When on, outlet list is for picking the active store (with confirm) instead of online toggles. */
  const [switchStoreMode, setSwitchStoreMode] = useState(false);
  const [pendingStoreSwitch, setPendingStoreSwitch] = useState<{
    storeId: string;
    storeName: string;
  } | null>(null);
  /** Same close / open modals as dashboard store status card (not the simple confirm dialog). */
  const [operationalCloseModal, setOperationalCloseModal] = useState<{ storeId: string; storeName: string } | null>(
    null
  );
  const [operationalOpenModal, setOperationalOpenModal] = useState<{ storeId: string; storeName: string } | null>(null);

  const [partnerNotifications, setPartnerNotifications] = useState<
    Array<{ id: string; title: string; body: string; read: boolean; created_at?: string }>
  >([]);
  const [partnerNotifLoading, setPartnerNotifLoading] = useState(false);
  const [storeSettings, setStoreSettings] = useState<PartnerSheetStoreSettings>(
    () => DEFAULT_PARTNER_SHEET_STORE_SETTINGS
  );

  const [deviceAcceptanceSlots, setDeviceAcceptanceSlots] = useState<
    [string | null, string | null, string | null] | null
  >(null);
  const [storePrimaryPhoneDisplay, setStorePrimaryPhoneDisplay] = useState<string | null>(null);
  const [deviceAlerts, setDeviceAlerts] = usePartnerDeviceOrderAlerts(resolvedStoreId || null);

  const loadStoreSettings = useCallback(async () => {
    if (!resolvedStoreId) return;
    try {
      const res = await fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(resolvedStoreId)}`, {
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        show_floating_orders?: boolean;
        communication_settings?: Record<string, unknown>;
        store_phones?: string[];
        primary_phone?: string | null;
      };
      if (!res.ok) {
        setStorePrimaryPhoneDisplay(null);
        return;
      }
      const comm = (data.communication_settings ?? {}) as Record<string, unknown>;
      const reports = (comm.reports ?? {}) as Record<string, unknown>;
      const orderNotifs = (comm.order_notifications ?? {}) as {
        enabled?: boolean;
        ring_volume?: number;
        ring_in_silent?: boolean;
      };
      migrateDeviceOrderAlertsFromServer(resolvedStoreId, orderNotifs);
      const phonesArr = Array.isArray(data.store_phones)
        ? data.store_phones.map((x) => String(x).trim()).filter((s) => s.length > 0)
        : [];
      const primaryFromApi =
        typeof data.primary_phone === 'string' && data.primary_phone.trim()
          ? data.primary_phone.trim()
          : phonesArr[0] ?? null;
      setStorePrimaryPhoneDisplay(primaryFromApi);
      setStoreSettings({
        show_floating_orders: data.show_floating_orders === true,
        communication_settings: {
          whatsapp_notifications: comm.whatsapp_notifications === true,
          reports: {
            daily_whatsapp: reports.daily_whatsapp === true,
            daily_email: reports.daily_email === true,
            weekly_whatsapp: reports.weekly_whatsapp === true,
            weekly_email: reports.weekly_email === true,
          },
          live_complaint_notifications: comm.live_complaint_notifications === true,
          rider_notifications: comm.rider_notifications === true,
        },
      });
    } catch {
      setStorePrimaryPhoneDisplay(null);
    }
  }, [resolvedStoreId]);

  useEffect(() => {
    if (sheet === 'settings') void loadStoreSettings();
  }, [sheet, loadStoreSettings]);

  useEffect(() => {
    if (sheet !== 'settings' || !resolvedStoreId) {
      setDeviceAcceptanceSlots(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/merchant/order-acceptance-settings?store_id=${encodeURIComponent(resolvedStoreId)}`
        );
        const data = (await res.json().catch(() => ({}))) as {
          settings?: { alert_sound_urls_by_slot?: [string | null, string | null, string | null] };
        };
        if (cancelled || !res.ok || !data.settings?.alert_sound_urls_by_slot) {
          if (!cancelled) setDeviceAcceptanceSlots(null);
          return;
        }
        const s = data.settings.alert_sound_urls_by_slot;
        setDeviceAcceptanceSlots([s[0] ?? null, s[1] ?? null, s[2] ?? null]);
      } catch {
        if (!cancelled) setDeviceAcceptanceSlots(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheet, resolvedStoreId]);

  const persistStoreSettingsToServer = useCallback(
    async (payload: PartnerSheetStoreSettings) => {
      if (!resolvedStoreId) return;
      try {
        const res = await fetch('/api/merchant/store-settings', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeId: resolvedStoreId,
            show_floating_orders: payload.show_floating_orders,
            communication_settings: payload.communication_settings,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(data.error || 'Could not save settings');
          await loadStoreSettings();
        }
      } catch {
        toast.error('Could not save settings');
        await loadStoreSettings();
      }
    },
    [resolvedStoreId, loadStoreSettings]
  );

  const fetchPartnerNotifications = useCallback(async () => {
    if (!resolvedStoreId) {
      setPartnerNotifications([]);
      return;
    }
    setPartnerNotifLoading(true);
    try {
      const res = await fetch(
        `/api/merchant/store-notifications?store_id=${encodeURIComponent(resolvedStoreId)}`,
        { credentials: 'include' }
      );
      const data = (await res.json().catch(() => ({}))) as {
        notifications?: Array<{ id: string; title: string; body: string; read: boolean; created_at?: string }>;
      };
      if (res.ok && Array.isArray(data.notifications)) {
        setPartnerNotifications(data.notifications);
      } else {
        setPartnerNotifications([]);
      }
    } catch {
      setPartnerNotifications([]);
    } finally {
      setPartnerNotifLoading(false);
    }
  }, [resolvedStoreId]);

  const hasWaitingPartner = useMemo(
    () => notificationListHasWaiting(partnerNotifications),
    [partnerNotifications]
  );
  const partnerUnreadCount = useMemo(
    () => partnerNotifications.filter((n) => !n.read).length,
    [partnerNotifications]
  );

  const markPartnerNotificationRead = useCallback(
    async (n: { id: string; read: boolean }) => {
      if (!resolvedStoreId || n.read) return;
      try {
        const res = await fetch('/api/merchant/store-notifications', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_id: resolvedStoreId,
            action: 'mark_read',
            notification_id: n.id,
          }),
        });
        if (res.ok) await fetchPartnerNotifications();
      } catch {
        /* ignore */
      }
    },
    [resolvedStoreId, fetchPartnerNotifications]
  );

  const markAllPartnerNotificationsRead = useCallback(async () => {
    if (!resolvedStoreId) return;
    try {
      const res = await fetch('/api/merchant/store-notifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: resolvedStoreId, action: 'mark_all_read' }),
      });
      if (res.ok) await fetchPartnerNotifications();
    } catch {
      /* ignore */
    }
  }, [resolvedStoreId, fetchPartnerNotifications]);

  useEffect(() => {
    const fromStorage =
      typeof window !== 'undefined' ? (localStorage.getItem('selectedStoreId') || '').trim() : '';
    setResolvedStoreId((restaurantId || '').trim() || fromStorage);
  }, [restaurantId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/merchant-auth/resolve-session', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok || !(data as any).success) return;
        setOwnerName(typeof (data as any).ownerName === 'string' ? (data as any).ownerName : null);
        setParentName(typeof (data as any).parentName === 'string' ? (data as any).parentName : null);
        setOwnerEmailResolved(
          typeof (data as any).ownerEmail === 'string' ? (data as any).ownerEmail : null
        );
        if (!Array.isArray((data as any).stores)) return;
        const approved = ((data as any).stores as any[]).filter(
          (s: any) => String(s.approval_status || '').toUpperCase() === 'APPROVED'
        );
        setStoreList(
          approved.map((s: any) => ({
            store_id: String(s.store_id),
            store_name: String(s.store_name || s.store_id || 'Store'),
            full_address: typeof s.full_address === 'string' ? s.full_address : '',
            banner_url: typeof s.banner_url === 'string' && s.banner_url.trim() ? s.banner_url.trim() : null,
          }))
        );
      } catch {
        /* ignore */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName =
    (merchantSession?.user?.name && merchantSession.user.name.trim()) ||
    (ownerName && ownerName.trim()) ||
    (parentName && parentName.trim()) ||
    (userEmail && userEmail.includes('@') ? userEmail.split('@')[0] : userEmail) ||
    'Account';

  const sessionAvatarUrl = merchantSession?.user?.avatar_url?.trim() || null;
  const parentBrandLogoRaw = merchantSession?.parent?.store_logo?.trim() || null;
  const parentBrandLogo = parentBrandLogoRaw ? (toStoredDocumentUrl(parentBrandLogoRaw) ?? parentBrandLogoRaw) : null;
  const effectiveAvatarUrl = localAvatarDataUrl || sessionAvatarUrl || parentBrandLogo;
  const avatarSrc = effectiveAvatarUrl && effectiveAvatarUrl !== brokenAvatarSrc ? effectiveAvatarUrl : null;

  useLayoutEffect(() => {
    if (!profileDropdownOpen || !profileTriggerRef.current) {
      setProfilePanelPos(null);
      return;
    }
    const r = profileTriggerRef.current.getBoundingClientRect();
    const width = Math.min(340, Math.max(288, r.width + 140));
    setProfilePanelPos({
      top: r.bottom + 8,
      right: Math.max(12, window.innerWidth - r.right),
      width,
    });
  }, [profileDropdownOpen]);

  useEffect(() => {
    if (!profileDropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (profileTriggerRef.current?.contains(t)) return;
      if (profilePanelRef.current?.contains(t)) return;
      setProfileDropdownOpen(false);
      setPhotoActionMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [profileDropdownOpen]);

  const refreshStoreOperations = useCallback(async () => {
    if (!resolvedStoreId) return;
    try {
      const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(resolvedStoreId)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && typeof data.operational_status === 'string') {
        const withinH =
          typeof (data as { within_operating_hours?: boolean }).within_operating_hours === 'boolean'
            ? (data as { within_operating_hours: boolean }).within_operating_hours
            : null;
        const todayClosed =
          typeof (data as { is_today_scheduled_closed?: boolean }).is_today_scheduled_closed === 'boolean'
            ? (data as { is_today_scheduled_closed: boolean }).is_today_scheduled_closed
            : null;
        clientStoreOpsDebugLog('refreshStoreOperations', {
          storeId: resolvedStoreId,
          operational_status: data.operational_status,
          last_toggle_type: (data as { last_toggle_type?: string }).last_toggle_type,
          within_hours_but_restricted: (data as { within_hours_but_restricted?: boolean })
            .within_hours_but_restricted,
          within_operating_hours: withinH,
          is_today_scheduled_closed: todayClosed,
        });
        setStoreOpen(data.operational_status === 'OPEN');
        setAutoOpenFromSchedule(data.auto_open_from_schedule !== false);
        setManualLock(data.block_auto_open === true);
        setStoreOpsById((prev) => ({
          ...prev,
          [resolvedStoreId]: {
            open: data.operational_status === 'OPEN',
            autoOpen: data.auto_open_from_schedule !== false,
            manualLock: data.block_auto_open === true,
            withinOperatingHours: withinH,
            todayScheduledClosed: todayClosed,
          },
        }));
      } else {
        setStoreOpen(null);
      }
    } catch {
      setStoreOpen(null);
    }
  }, [resolvedStoreId]);

  const refetchStoreOp = useCallback(async (storeId: string): Promise<boolean> => {
    if (!storeId) return false;
    try {
      const res = await fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && typeof data.operational_status === 'string') {
        const withinH =
          typeof (data as { within_operating_hours?: boolean }).within_operating_hours === 'boolean'
            ? (data as { within_operating_hours: boolean }).within_operating_hours
            : null;
        const todayClosed =
          typeof (data as { is_today_scheduled_closed?: boolean }).is_today_scheduled_closed === 'boolean'
            ? (data as { is_today_scheduled_closed: boolean }).is_today_scheduled_closed
            : null;
        clientStoreOpsDebugLog('refetchStoreOp', {
          storeId,
          operational_status: data.operational_status,
          last_toggle_type: (data as { last_toggle_type?: string }).last_toggle_type,
          last_toggled_at: (data as { last_toggled_at?: string }).last_toggled_at,
          restriction_type: (data as { restriction_type?: string }).restriction_type,
          within_operating_hours: withinH,
          is_today_scheduled_closed: todayClosed,
        });
        const row: StoreOpRow = {
          open: data.operational_status === 'OPEN',
          autoOpen: data.auto_open_from_schedule !== false,
          manualLock: data.block_auto_open === true,
          withinOperatingHours: withinH,
          todayScheduledClosed: todayClosed,
        };
        setStoreOpsById((prev) => ({ ...prev, [storeId]: row }));
        if (storeId === resolvedStoreId) {
          setStoreOpen(row.open);
          setAutoOpenFromSchedule(row.autoOpen);
          setManualLock(row.manualLock);
        }
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }, [resolvedStoreId]);

  const refetchAllStoreOps = useCallback(async () => {
    const ids =
      storeList.length > 0
        ? storeList.map((s) => s.store_id)
        : resolvedStoreId
          ? [resolvedStoreId]
          : [];
    const results = await Promise.all(ids.map((id) => refetchStoreOp(id)));
    const ok = results.filter(Boolean).length;
    return { ok, total: ids.length };
  }, [storeList, resolvedStoreId, refetchStoreOp]);

  useEffect(() => {
    if (!resolvedStoreId) return;
    refreshStoreOperations();
    const t = window.setInterval(refreshStoreOperations, 60_000);
    return () => window.clearInterval(t);
  }, [refreshStoreOperations, resolvedStoreId]);

  useEffect(() => {
    if (!resolvedStoreId) return;
    void fetchPartnerNotifications();
    const t = window.setInterval(() => void fetchPartnerNotifications(), 60_000);
    return () => window.clearInterval(t);
  }, [resolvedStoreId, fetchPartnerNotifications]);

  useEffect(() => {
    if (sheet === 'notifications' && resolvedStoreId) void fetchPartnerNotifications();
  }, [sheet, resolvedStoreId, fetchPartnerNotifications]);

  useEffect(() => {
    if (sheet !== 'status') return;
    void refetchAllStoreOps();
  }, [sheet, refetchAllStoreOps]);

  useEffect(() => {
    prevSheetRef.current = sheet;
  }, [sheet]);

  // Keep a global CSS var in sync with header height so Sonner toasts never overlap it.
  useLayoutEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    const root = document.documentElement;
    const setVars = () => {
      const h = Math.max(0, Math.ceil(el.getBoundingClientRect().height));
      root.style.setProperty('--mx-partner-topbar-h', `${h}px`);
      root.style.setProperty('--mx-toast-top', `${h + 12}px`);
    };
    setVars();
    const ro = new ResizeObserver(() => setVars());
    ro.observe(el);
    window.addEventListener('resize', setVars);
    return () => {
      window.removeEventListener('resize', setVars);
      ro.disconnect();
    };
  }, []);

  // Extra safety: re-measure after header title changes (some browsers/fonts
  // can miss a ResizeObserver tick during fast route transitions).
  useEffect(() => {
    const el = topbarRef.current;
    if (!el || typeof document === 'undefined') return;
    const root = document.documentElement;
    const setVars = () => {
      const h = Math.max(0, Math.ceil(el.getBoundingClientRect().height));
      root.style.setProperty('--mx-partner-topbar-h', `${h}px`);
      root.style.setProperty('--mx-toast-top', `${h + 12}px`);
    };
    const t = window.setTimeout(setVars, 0);
    return () => window.clearTimeout(t);
  }, [
    partnerShellHeader?.header.title,
    headerTitle,
  ]);

  useEffect(() => {
    if (sheet !== 'status') {
      setSwitchStoreMode(false);
      setPendingStoreSwitch(null);
      setOperationalCloseModal(null);
      setOperationalOpenModal(null);
    }
  }, [sheet]);

  useEffect(() => {
    if (sheet !== 'status') return;
    const sid = (scheduleStorePick || resolvedStoreId || '').trim();
    if (!sid) return;
    void (async () => {
      try {
        const res = await fetch(`/api/merchant/schedule-off?store_id=${encodeURIComponent(sid)}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray((data as any).closures)) {
          setScheduleClosures((data as any).closures);
        } else setScheduleClosures([]);
      } catch {
        setScheduleClosures([]);
      }
    })();
  }, [sheet, scheduleStorePick, resolvedStoreId]);

  useEffect(() => {
    if (resolvedStoreId) setScheduleStorePick(resolvedStoreId);
  }, [resolvedStoreId]);

  const switchToStore = (id: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('selectedStoreId', id);
    setSheet(null);
    const base = (pathname || '/partners/dashboard').split('?')[0];
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.set('storeId', id);
    window.location.href = `${base}?${params.toString()}`;
  };

  const goToAllStores = () => {
    setSheet(null);
    window.location.href = '/partners/all-stores';
  };

  const clearPartnerLocalStorage = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('restaurantId');
    localStorage.removeItem('restaurantName');
    localStorage.removeItem('selectedStoreId');
    localStorage.removeItem('storeList');
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      clearPartnerLocalStorage();
      if (merchantSession?.logout) await merchantSession.logout();
      else router.push('/auth/login');
    } catch {
      router.push('/auth/login');
    } finally {
      setIsLoggingOut(false);
      setShowLogoutModal(false);
      setSheet(null);
      setProfileDropdownOpen(false);
    }
  };

  const handleLogoutAllDevices = async () => {
    setIsLoggingOut(true);
    try {
      const res = await fetch('/api/merchant-auth/logout-all', {
        method: 'POST',
        credentials: 'include',
      });
      clearPartnerLocalStorage();
      if (res.ok) {
        toast.success('Signed out from all devices');
        router.push('/auth/login');
      } else {
        toast.error('Could not sign out everywhere. Try again.');
      }
    } catch {
      toast.error('Could not sign out everywhere. Try again.');
    } finally {
      setIsLoggingOut(false);
      setProfileDropdownOpen(false);
    }
  };

  const persistAutoOpenFor = async (storeId: string, enabled: boolean) => {
    if (!storeId) return;
    const prevRow = storeOpsById[storeId];
    const prev = prevRow?.autoOpen ?? true;
    setStoreOpsById((p) => ({
      ...p,
      [storeId]: {
        open: p[storeId]?.open ?? null,
        autoOpen: enabled,
        manualLock: p[storeId]?.manualLock ?? false,
        withinOperatingHours: p[storeId]?.withinOperatingHours ?? null,
        todayScheduledClosed: p[storeId]?.todayScheduledClosed ?? null,
      },
    }));
    if (storeId === resolvedStoreId) setAutoOpenFromSchedule(enabled);
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          action: 'update_auto_open_schedule',
          auto_open_from_schedule: enabled,
        }),
      });
      if (!res.ok) {
        setStoreOpsById((p) => ({
          ...p,
          [storeId]: {
            open: p[storeId]?.open ?? null,
            autoOpen: prev,
            manualLock: p[storeId]?.manualLock ?? false,
            withinOperatingHours: p[storeId]?.withinOperatingHours ?? null,
            todayScheduledClosed: p[storeId]?.todayScheduledClosed ?? null,
          },
        }));
        if (storeId === resolvedStoreId) setAutoOpenFromSchedule(prev);
        toast.error('Could not update auto-open setting');
        return;
      }
      toast.success(enabled ? 'Auto-open from schedule on' : 'Auto-open from schedule off');
      await refetchStoreOp(storeId);
    } catch {
      setStoreOpsById((p) => ({
        ...p,
        [storeId]: {
          open: p[storeId]?.open ?? null,
          autoOpen: prev,
          manualLock: p[storeId]?.manualLock ?? false,
          withinOperatingHours: p[storeId]?.withinOperatingHours ?? null,
          todayScheduledClosed: p[storeId]?.todayScheduledClosed ?? null,
        },
      }));
      if (storeId === resolvedStoreId) setAutoOpenFromSchedule(prev);
      toast.error('Could not update auto-open setting');
    }
  };

  const persistManualLockFor = async (storeId: string, enabled: boolean) => {
    if (!storeId) return;
    const prevRow = storeOpsById[storeId];
    const prev = prevRow?.manualLock ?? false;
    setStoreOpsById((p) => ({
      ...p,
      [storeId]: {
        open: p[storeId]?.open ?? null,
        autoOpen: p[storeId]?.autoOpen ?? true,
        manualLock: enabled,
        withinOperatingHours: p[storeId]?.withinOperatingHours ?? null,
        todayScheduledClosed: p[storeId]?.todayScheduledClosed ?? null,
      },
    }));
    if (storeId === resolvedStoreId) setManualLock(enabled);
    try {
      const res = await fetch('/api/store-operations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          action: 'update_manual_lock',
          block_auto_open: enabled,
        }),
      });
      if (!res.ok) {
        setStoreOpsById((p) => ({
          ...p,
          [storeId]: {
            open: p[storeId]?.open ?? null,
            autoOpen: p[storeId]?.autoOpen ?? true,
            manualLock: prev,
            withinOperatingHours: p[storeId]?.withinOperatingHours ?? null,
            todayScheduledClosed: p[storeId]?.todayScheduledClosed ?? null,
          },
        }));
        if (storeId === resolvedStoreId) setManualLock(prev);
        toast.error('Could not update manual lock');
        return;
      }
      toast.success(enabled ? 'Manual activation lock on' : 'Manual activation lock off');
      await refetchStoreOp(storeId);
    } catch {
      setStoreOpsById((p) => ({
        ...p,
        [storeId]: {
          open: p[storeId]?.open ?? null,
          autoOpen: p[storeId]?.autoOpen ?? true,
          manualLock: prev,
          withinOperatingHours: p[storeId]?.withinOperatingHours ?? null,
          todayScheduledClosed: p[storeId]?.todayScheduledClosed ?? null,
        },
      }));
      if (storeId === resolvedStoreId) setManualLock(prev);
      toast.error('Could not update manual lock');
    }
  };

  /** Matches `submitScheduleOff` gates so the primary action reads “active” only when submit would succeed. */
  const scheduleFormSubmitReady = useMemo(() => {
    const sid = (scheduleStorePick || resolvedStoreId || '').trim();
    if (!sid) return false;
    if (!schedReason.trim()) return false;
    const startsAt = combineLocalDateTime(schedStartDate, schedStartTime);
    const endsAt = combineLocalDateTime(schedEndDate, schedEndTime);
    if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) return false;
    return true;
  }, [
    scheduleStorePick,
    resolvedStoreId,
    schedReason,
    schedStartDate,
    schedStartTime,
    schedEndDate,
    schedEndTime,
  ]);

  const submitScheduleOff = async () => {
    const sid = scheduleStorePick || resolvedStoreId;
    if (!sid) {
      toast.error('Select a store');
      return;
    }
    if (!schedReason) {
      toast.error('Select a reason');
      return;
    }
    const startsAtCheck = combineLocalDateTime(schedStartDate, schedStartTime);
    const endsAtCheck = combineLocalDateTime(schedEndDate, schedEndTime);
    if (!startsAtCheck || !endsAtCheck || endsAtCheck.getTime() <= startsAtCheck.getTime()) {
      toast.error('Enter valid start and end date/time');
      return;
    }
    setSchedSaving(true);
    try {
      const startsAt = combineLocalDateTime(schedStartDate, schedStartTime)!.toISOString();
      const endsAt = combineLocalDateTime(schedEndDate, schedEndTime)!.toISOString();
      const res = await fetch('/api/merchant/schedule-off', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: sid,
          reason: schedReason,
          permanent: false,
          starts_at: startsAt,
          ends_at: endsAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as any).message || (data as any).error || 'Schedule failed');
        return;
      }
      toast.success('Scheduled time-off set');
      setSchedReason('');
      setSchedStartDate('');
      setSchedStartTime('');
      setSchedEndDate('');
      setSchedEndTime('');
      const r = await fetch(`/api/merchant/schedule-off?store_id=${encodeURIComponent(sid)}`, {
        credentials: 'include',
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray((d as any).closures)) setScheduleClosures((d as any).closures);
      await refetchStoreOp(sid);
    } catch {
      toast.error('Schedule failed');
    } finally {
      setSchedSaving(false);
    }
  };

  const cancelScheduledOff = async () => {
    const sid = scheduleStorePick || resolvedStoreId;
    if (!sid) return;
    setSchedSaving(true);
    try {
      const res = await fetch(`/api/merchant/schedule-off?store_id=${encodeURIComponent(sid)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        toast.error('Could not cancel schedule');
        return;
      }
      toast.success('Scheduled closure cancelled');
      setScheduleClosures([]);
      await refetchStoreOp(sid);
    } catch {
      toast.error('Could not cancel schedule');
    } finally {
      setSchedSaving(false);
    }
  };

  const toggleConfirmCopy = pendingToggle
    ? (() => {
        if (pendingToggle.kind === 'autoOpen') {
          return pendingToggle.nextEnabled
            ? {
                title: 'Enable auto-open from schedule?',
                message:
                  'This outlet will follow saved opening hours and open/close automatically when the schedule allows.',
              }
            : {
                title: 'Disable auto-open from schedule?',
                message:
                  'Scheduled hours will no longer open the outlet automatically. You control online status manually.',
              };
        }
        return pendingToggle.nextEnabled
          ? {
              title: 'Turn on manual activation lock?',
              message:
                'The outlet stays closed until you open it manually, even during scheduled opening hours.',
            }
          : {
              title: 'Turn off manual activation lock?',
              message: 'The outlet can follow auto-open from schedule again (if that option is on). Continue?',
            };
      })()
    : { title: '', message: '' };

  const confirmToggleAction = async () => {
    if (!pendingToggle) return;
    setToggleConfirmLoading(true);
    try {
      if (pendingToggle.kind === 'autoOpen') {
        await persistAutoOpenFor(pendingToggle.storeId, pendingToggle.nextEnabled);
      } else {
        await persistManualLockFor(pendingToggle.storeId, pendingToggle.nextEnabled);
      }
      setPendingToggle(null);
    } finally {
      setToggleConfirmLoading(false);
    }
  };

  const handleOperationalFlowSuccess = useCallback(async () => {
    await refetchAllStoreOps();
  }, [refetchAllStoreOps]);

  const leftW = sidebarCollapsed ? 'md:w-14' : 'md:w-52';
  const resolvedOpsRow = resolvedStoreId ? storeOpsById[resolvedStoreId] : undefined;
  const onlineLabel =
    storeOpen === null
      ? 'Status'
      : storeOpen
        ? 'Online'
        : resolvedOpsRow?.todayScheduledClosed === true
          ? 'Offline · Closed today'
          : resolvedOpsRow?.withinOperatingHours === false
            ? 'Offline · Outside hours'
            : 'Offline';
  const onlineGreen = storeOpen === true;

  const q = resolvedStoreId ? `?storeId=${encodeURIComponent(resolvedStoreId)}` : '';
  const settingsHref = `/partners/store-settings${q}`;
  const profileHref = `/partners/profile${q}`;

  const resolvedHeaderTitle = (
    partnerShellHeader?.header.title?.trim() ||
    headerTitle ||
    ''
  ).trim();
  const resolvedHeaderBreadcrumbs = useMemo(() => {
    const overrideBreadcrumbs = partnerShellHeader?.header.breadcrumbs ?? [];
    if (overrideBreadcrumbs.length > 0) return overrideBreadcrumbs;

    const parts = (pathname ?? '').split('/').filter(Boolean);
    const appRoute = parts[0] === 'partners' ? parts[1] ?? '' : parts[0] ?? '';
    const storeSettingsTab = (searchParams?.get('tab') || '').trim();
    const sectionLabelMap: Record<string, string> = {
      dashboard: 'Dashboard',
      orders: 'Orders',
      'store-settings': 'Settings',
      'order-history': 'Order History',
      'food-orders': 'Orders',
      menu: 'Menu',
      offers: 'Offers',
      payments: 'Payments',
      profile: 'Profile',
      'audit-logs': 'Audit & Activity',
      customizations: 'Customizations',
      'refund-policy': 'Refund Policy',
      'user-insights': 'User Insights',
      'support-inbox': 'Support Inbox',
    };
    const storeSettingsTabLabelMap: Record<string, string> = {
      plans: 'Plans & Subscription',
      premium: 'Premium Plans',
      timings: 'Outlet Timings',
      operations: 'Store Operations',
      'menu-capacity': 'Menu & Capacity',
      delivery: 'Delivery & Riders',
      address: 'Store Address',
      pos: 'POS Integration',
      notifications: 'Notifications',
      audit: 'Audit & Activity',
      gatimitra: 'Store on GatiMitra',
    };
    const sectionLabel =
      sectionLabelMap[appRoute] ||
      (appRoute
        ? appRoute
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        : '');
    const pageLabel =
      appRoute === 'store-settings' && storeSettingsTab
        ? storeSettingsTabLabelMap[storeSettingsTab] || 'Store Settings'
        : resolvedHeaderTitle || headerTitle || sectionLabel;
    const rootCrumb = { label: 'Partner', href: '/partners/dashboard' };
    const sectionHref = parts.length >= 2 ? `/${parts.slice(0, 2).join('/')}` : '/partners/dashboard';
    const crumbs: Array<{ label: string; href?: string }> = [rootCrumb];
    if (sectionLabel && sectionLabel.toLowerCase() !== pageLabel.toLowerCase()) {
      crumbs.push({ label: sectionLabel, href: sectionHref });
    }
    if (pageLabel && pageLabel.toLowerCase() !== sectionLabel.toLowerCase()) {
      crumbs.push({ label: pageLabel });
    }
    return crumbs;
  }, [headerTitle, pathname, partnerShellHeader?.header.breadcrumbs, resolvedHeaderTitle, searchParams]);

  const sheetTitle: Record<PartnerHeaderSheet, string> = {
    notifications: 'Notifications',
    settings: 'Settings',
    status: 'Store status',
  };

  const displayStores: Array<{
    store_id: string;
    store_name: string;
    full_address: string;
    banner_url?: string | null;
  }> =
    storeList.length > 0
      ? storeList
      : resolvedStoreId
        ? [{ store_id: resolvedStoreId, store_name: restaurantName, full_address: '', banner_url: null }]
        : [];

  const activeOutletSummary =
    resolvedStoreId.trim().length > 0
      ? {
          name:
            displayStores.find((s) => s.store_id === resolvedStoreId)?.store_name ?? restaurantName,
          id: resolvedStoreId,
        }
      : null;

  /** Active session outlet first so it is always row 1 in the sheet list and dropdown. */
  const ridForOrder = (resolvedStoreId || '').trim();
  const outletsOrderedForStatus =
    !ridForOrder
      ? displayStores
      : [...displayStores].sort((a, b) => {
          if (a.store_id === ridForOrder) return -1;
          if (b.store_id === ridForOrder) return 1;
          return 0;
        });

  // If only one outlet exists, hide/disable switching.
  useEffect(() => {
    if (outletsOrderedForStatus.length <= 1 && switchStoreMode) {
      setSwitchStoreMode(false);
    }
  }, [outletsOrderedForStatus.length, switchStoreMode]);

  const sheetBody = () => {
    if (!sheet) return null;
    switch (sheet) {
      case 'notifications':
        return (
          <div className="space-y-0">
            {partnerNotifLoading && partnerNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-500">
                <Loader2 className="mb-2 h-8 w-8 animate-spin text-sky-600" />
                Loading notifications…
              </div>
            ) : partnerNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-gray-500">
                <Bell size={40} className="mb-3 text-gray-300" strokeWidth={1.25} />
                <p>No notifications yet</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {partnerNotifications.map((n) => (
                  <li
                    key={n.id}
                    className={`flex gap-1 py-3 ${n.read ? 'bg-white' : 'bg-slate-50/90'}`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                      onClick={() => void markPartnerNotificationRead(n)}
                    >
                      <div className="mt-0.5 shrink-0">
                        {n.title.trim() === WAITING_FOR_ORDER_TITLE ? (
                          <RadarLiveIndicator compact />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-700">
                            <Bell size={18} strokeWidth={1.75} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pr-1">
                        <div className="flex items-start gap-2">
                          <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                          {!n.read ? (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-hidden />
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs leading-snug text-gray-600">{n.body}</p>
                        {n.created_at ? (
                          <p className="mt-1 text-[10px] text-gray-400">
                            {new Date(n.created_at).toLocaleString()}
                          </p>
                        ) : null}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 self-start rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                      aria-label="Delete notification"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!resolvedStoreId) return;
                        try {
                          const res = await fetch(
                            `/api/merchant/store-notifications?store_id=${encodeURIComponent(resolvedStoreId)}&notification_id=${encodeURIComponent(n.id)}`,
                            { method: 'DELETE', credentials: 'include' }
                          );
                          if (res.ok) await fetchPartnerNotifications();
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-3">
                <div className="flex gap-3 pb-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <WhatsappBrandIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-900">WhatsApp alerts</p>
                    <p className="mt-0.5 text-xs leading-snug text-gray-500">
                      Receive updates and other reminders related to your restaurant on WhatsApp
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      {storePrimaryPhoneDisplay ? (
                        <p className="min-w-0 shrink text-sm font-bold tabular-nums text-gray-900">
                          {storePrimaryPhoneDisplay}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">No primary number on file</p>
                      )}
                      <CompactSwitch
                        on={storeSettings.communication_settings.whatsapp_notifications}
                        ariaLabel="WhatsApp alerts"
                        onToggle={() =>
                          setStoreSettings((p) => {
                            const next = {
                              ...p,
                              communication_settings: {
                                ...p.communication_settings,
                                whatsapp_notifications: !p.communication_settings.whatsapp_notifications,
                              },
                            };
                            void persistStoreSettingsToServer(next);
                            return next;
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-bold text-gray-900">Business reports</p>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-bold text-gray-900">Daily reports</p>
                        <p className="mt-0.5 text-xs text-gray-500">Every morning for previous day</p>
                        <div className="mt-3 space-y-3">
                          <label className="flex cursor-pointer items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-gray-900">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                <WhatsappBrandIcon className="h-[18px] w-[18px]" />
                              </span>
                              <span className="leading-tight">Share reports on whatsapp</span>
                            </span>
                            <CompactSwitch
                              on={storeSettings.communication_settings.reports.daily_whatsapp}
                              ariaLabel="Daily WhatsApp report"
                              onToggle={() =>
                                setStoreSettings((p) => {
                                  const next = {
                                    ...p,
                                    communication_settings: {
                                      ...p.communication_settings,
                                      reports: {
                                        ...p.communication_settings.reports,
                                        daily_whatsapp: !p.communication_settings.reports.daily_whatsapp,
                                      },
                                    },
                                  };
                                  void persistStoreSettingsToServer(next);
                                  return next;
                                })
                              }
                            />
                          </label>
                          <label className="flex cursor-pointer items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-gray-900">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                <Mail className="h-[18px] w-[18px]" aria-hidden />
                              </span>
                              <span className="leading-tight">Share reports on email</span>
                            </span>
                            <CompactSwitch
                              on={storeSettings.communication_settings.reports.daily_email}
                              ariaLabel="Daily email report"
                              onToggle={() =>
                                setStoreSettings((p) => {
                                  const next = {
                                    ...p,
                                    communication_settings: {
                                      ...p.communication_settings,
                                      reports: {
                                        ...p.communication_settings.reports,
                                        daily_email: !p.communication_settings.reports.daily_email,
                                      },
                                    },
                                  };
                                  void persistStoreSettingsToServer(next);
                                  return next;
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>

                      <div className="h-px bg-gray-100" />

                      <div>
                        <p className="text-sm font-bold text-gray-900">Weekly reports</p>
                        <p className="mt-0.5 text-xs text-gray-500">Every Monday for previous week</p>
                        <div className="mt-3 space-y-3">
                          <label className="flex cursor-pointer items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-gray-900">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                <WhatsappBrandIcon className="h-[18px] w-[18px]" />
                              </span>
                              <span className="leading-tight">Share reports on whatsapp</span>
                            </span>
                            <CompactSwitch
                              on={storeSettings.communication_settings.reports.weekly_whatsapp}
                              ariaLabel="Weekly WhatsApp report"
                              onToggle={() =>
                                setStoreSettings((p) => {
                                  const next = {
                                    ...p,
                                    communication_settings: {
                                      ...p.communication_settings,
                                      reports: {
                                        ...p.communication_settings.reports,
                                        weekly_whatsapp: !p.communication_settings.reports.weekly_whatsapp,
                                      },
                                    },
                                  };
                                  void persistStoreSettingsToServer(next);
                                  return next;
                                })
                              }
                            />
                          </label>
                          <label className="flex cursor-pointer items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2.5 text-sm font-medium text-gray-900">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                                <Mail className="h-[18px] w-[18px]" aria-hidden />
                              </span>
                              <span className="leading-tight">Share reports on email</span>
                            </span>
                            <CompactSwitch
                              on={storeSettings.communication_settings.reports.weekly_email}
                              ariaLabel="Weekly email report"
                              onToggle={() =>
                                setStoreSettings((p) => {
                                  const next = {
                                    ...p,
                                    communication_settings: {
                                      ...p.communication_settings,
                                      reports: {
                                        ...p.communication_settings.reports,
                                        weekly_email: !p.communication_settings.reports.weekly_email,
                                      },
                                    },
                                  };
                                  void persistStoreSettingsToServer(next);
                                  return next;
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                  <p className="mb-3 text-base font-bold text-gray-900">Order management</p>

                  <div className="divide-y divide-gray-100">
                    <div className="flex gap-3 pb-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600">
                        <Bell size={18} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">Order alerts</p>
                          <CompactSwitch
                            on={deviceAlerts.orderAlertsEnabled}
                            ariaLabel="Order alerts"
                            onToggle={() => {
                              const next = !deviceAlerts.orderAlertsEnabled;
                              setDeviceAlerts({ orderAlertsEnabled: next });
                            }}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          You will receive all order related alerts on this device.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600">
                        <Megaphone size={18} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900">Sound alerts</p>
                          <CompactSwitch
                            on={deviceAlerts.soundAlertsEnabled}
                            ariaLabel="Sound alerts"
                            onToggle={() => {
                              const next = !deviceAlerts.soundAlertsEnabled;
                              setDeviceAlerts({ soundAlertsEnabled: next });
                              syncFoodOrdersUiNotifyFromDevice(resolvedStoreId, next);
                            }}
                          />
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          You will receive sound alerts on this device.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-3 py-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600">
                        <Phone size={18} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm font-semibold text-gray-900">Select ringtone</p>
                        {(() => {
                          const slots = deviceAcceptanceSlots ?? [null, null, null];
                          const ringtoneOptions: { slot: number; label: string }[] = [];
                          slots.forEach((u, i) => {
                            if (u && String(u).trim())
                              ringtoneOptions.push({
                                slot: i,
                                label: `Gmitra Notification - ${i + 1}`,
                              });
                          });
                          const selectSlot = ringtoneOptions.some((o) => o.slot === deviceAlerts.alertSoundSlot)
                            ? deviceAlerts.alertSoundSlot
                            : (ringtoneOptions[0]?.slot ?? 0);
                          return ringtoneOptions.length === 0 ? (
                            <p className="text-xs text-gray-500">No ringtones configured for this store yet.</p>
                          ) : (
                            <div className="relative">
                              <select
                                value={selectSlot}
                                onChange={(e) =>
                                  setDeviceAlerts({ alertSoundSlot: Math.max(0, Math.min(2, Number(e.target.value))) })
                                }
                                className="w-full appearance-none rounded-lg border border-gray-200 bg-white py-2.5 pl-3 pr-9 text-sm font-medium text-gray-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                              >
                                {ringtoneOptions.map((o) => (
                                  <option key={o.slot} value={o.slot}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown
                                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                                aria-hidden
                              />
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex gap-3 pt-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600">
                        <Volume2 size={18} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-sm font-semibold text-gray-900">Volume</p>
                        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/80 px-2 py-1.5">
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-lg font-semibold text-sky-600 hover:bg-white"
                            aria-label="Decrease volume"
                            onClick={() =>
                              setDeviceAlerts({ volumeStep: Math.max(0, deviceAlerts.volumeStep - 1) })
                            }
                          >
                            −
                          </button>
                          <span className="min-w-[2.5rem] text-center text-sm font-semibold tabular-nums text-gray-900">
                            {deviceAlerts.volumeStep * 10}
                          </span>
                          <button
                            type="button"
                            className="flex h-9 w-9 items-center justify-center rounded-md text-lg font-semibold text-sky-600 hover:bg-white"
                            aria-label="Increase volume"
                            onClick={() =>
                              setDeviceAlerts({ volumeStep: Math.min(10, deviceAlerts.volumeStep + 1) })
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                      <span className="text-sm font-medium text-gray-900">Ring in silent mode</span>
                      <CompactSwitch
                        on={deviceAlerts.ringInSilent}
                        ariaLabel="Ring in silent mode"
                        onToggle={() => setDeviceAlerts({ ringInSilent: !deviceAlerts.ringInSilent })}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Other notifications</p>
                  <div className="mt-3 space-y-4">
                    <div>
                      <label className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="text-sm font-medium text-gray-900">Live complaint notifications</span>
                        <CompactSwitch
                          on={storeSettings.communication_settings.live_complaint_notifications}
                          ariaLabel="Live complaint notifications"
                          onToggle={() =>
                            setStoreSettings((p) => {
                              const next = {
                                ...p,
                                communication_settings: {
                                  ...p.communication_settings,
                                  live_complaint_notifications:
                                    !p.communication_settings.live_complaint_notifications,
                                },
                              };
                              void persistStoreSettingsToServer(next);
                              return next;
                            })
                          }
                        />
                      </label>
                      <p className="mt-1 text-[10px] leading-snug text-gray-500">
                        Receive a notification whenever a customer raises a complaint on an order.
                      </p>
                    </div>

                    <div className="h-px bg-gray-100" />

                    <div>
                      <label className="flex cursor-pointer items-center justify-between gap-3">
                        <span className="text-sm font-medium text-gray-900">Rider notifications</span>
                        <CompactSwitch
                          on={storeSettings.communication_settings.rider_notifications}
                          ariaLabel="Rider notifications"
                          onToggle={() =>
                            setStoreSettings((p) => {
                              const next = {
                                ...p,
                                communication_settings: {
                                  ...p.communication_settings,
                                  rider_notifications: !p.communication_settings.rider_notifications,
                                },
                              };
                              void persistStoreSettingsToServer(next);
                              return next;
                            })
                          }
                        />
                      </label>
                      <p className="mt-1 text-[10px] leading-snug text-gray-500">
                        Get alerts when your rider is assigned, delayed or changes status.
                      </p>
                    </div>

                    <div className="h-px bg-gray-100" />

                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span className="text-sm font-medium text-gray-900">Show floating orders</span>
                      <CompactSwitch
                        on={storeSettings.show_floating_orders}
                        ariaLabel="Show floating orders"
                        onToggle={() =>
                          setStoreSettings((p) => {
                            const next = { ...p, show_floating_orders: !p.show_floating_orders };
                            void persistStoreSettingsToServer(next);
                            return next;
                          })
                        }
                      />
                    </label>
                  </div>
                </div>
          </div>
        );
      case 'status':
        return (
          <div className="space-y-5">
            <div className="flex rounded-2xl bg-slate-100/90 p-1 ring-1 ring-slate-200/70">
              <button
                type="button"
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  statusTab === 'manage'
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setStatusTab('manage')}
              >
                Manage Outlet
              </button>
              <button
                type="button"
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  statusTab === 'schedule'
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setStatusTab('schedule')}
              >
                Schedule time-off
              </button>
            </div>

            {statusTab === 'manage' ? (
              <div className="space-y-5">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white py-3.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100 transition hover:border-sky-200/80 hover:bg-sky-50/60 hover:text-sky-950"
                  onClick={() => {
                    setSheet(null);
                    router.push('/partners/all-stores');
                  }}
                >
                  View all outlets
                  <ChevronRight className="h-4 w-4 text-sky-600" aria-hidden />
                </button>

                <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-b from-white to-slate-50/40 p-3 shadow-[0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/90">
                  {outletsOrderedForStatus.length > 1 ? (
                    <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 shadow-sm">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900">Switch store</p>
                        <p className="text-[10px] leading-snug text-gray-500">
                          {switchStoreMode
                            ? 'Tap another outlet to make it active'
                            : 'Turn on to pick a different outlet'}
                        </p>
                      </div>
                      <CompactSwitch
                        on={switchStoreMode}
                        ariaLabel="Switch store mode"
                        onToggle={() => setSwitchStoreMode((v) => !v)}
                      />
                    </div>
                  ) : null}
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      All outlets
                    </span>
                    <span className="rounded-full bg-slate-200/80 px-1.5 py-px text-[10px] font-semibold text-slate-600">
                      {outletsOrderedForStatus.length}
                    </span>
                  </div>
                  {outletsOrderedForStatus.length === 0 ? (
                    <p className="py-4 text-center text-xs text-gray-500">No approved stores yet.</p>
                  ) : (
                    <ul className="max-h-[min(48vh,300px)] space-y-1 overflow-y-auto pr-0.5">
                      {outletsOrderedForStatus.map((s) => {
                        const row = storeOpsById[s.store_id];
                        const isOn = row?.open;
                        const isCurrent = s.store_id === resolvedStoreId;
                        const city =
                          s.full_address?.split(',').pop()?.trim() ||
                          (s.full_address ? s.full_address.slice(0, 28) : '');
                        return (
                          <li
                            key={s.store_id}
                            className={`flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm transition-colors ${
                              isCurrent
                                ? 'border-sky-200/90 ring-1 ring-sky-100'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <OutletBannerThumb url={s.banner_url} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug text-gray-900 sm:text-[15px]">
                                {s.store_name}
                              </p>
                              <p className="mt-0.5 text-xs leading-snug text-gray-500">
                                <span className="font-medium text-gray-500">ID:</span>{' '}
                                <span className="font-mono text-[12px] text-gray-600">{s.store_id}</span>
                                {city ? <span className="text-gray-300"> | </span> : null}
                                {city ? <span className="text-gray-500">{city}</span> : null}
                              </p>
                            </div>
                            {switchStoreMode ? (
                              <div className="flex shrink-0 items-center">
                                {isCurrent ? (
                                  <span className="rounded-full bg-sky-600/10 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                                    Active
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    className="rounded-lg bg-sky-600 px-2.5 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-sky-700"
                                    onClick={() =>
                                      setPendingStoreSwitch({
                                        storeId: s.store_id,
                                        storeName: s.store_name,
                                      })
                                    }
                                  >
                                    Switch
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex shrink-0 items-center gap-3">
                                <span
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                    isOn == null
                                      ? 'bg-gray-200 text-gray-600'
                                      : isOn
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-gray-200 text-gray-700'
                                  }`}
                                >
                                  {isOn == null
                                    ? '—'
                                    : isOn
                                      ? 'Online'
                                      : row?.todayScheduledClosed === true
                                        ? 'Offline · Closed today'
                                        : row?.withinOperatingHours === false
                                          ? 'Offline · Outside hours'
                                          : 'Offline'}
                                </span>
                                <CompactSwitch
                                  on={isOn === true}
                                  disabled={isOn === null}
                                  ariaLabel={`${isOn === true ? 'Turn off' : 'Turn on'} ${s.store_name}`}
                                  onToggle={() => {
                                    if (isOn === true) {
                                      setOperationalCloseModal({
                                        storeId: s.store_id,
                                        storeName: s.store_name,
                                      });
                                    } else {
                                      setOperationalOpenModal({
                                        storeId: s.store_id,
                                        storeName: s.store_name,
                                      });
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5 pb-1">
                <div>
                  <label className="mb-2 block text-sm font-bold tracking-tight text-slate-900">Select a restaurant</label>
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-1/2 z-[1] h-[18px] w-[18px] -translate-y-1/2 text-gray-400"
                      aria-hidden
                    />
                    <select
                      className="w-full min-w-0 appearance-none truncate rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-10 text-left text-sm font-normal text-gray-900 shadow-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                      value={scheduleStorePick}
                      onChange={(e) => setScheduleStorePick(e.target.value)}
                    >
                      {storeList.map((s) => (
                        <option key={s.store_id} value={s.store_id}>
                          {s.store_name}
                        </option>
                      ))}
                      {!storeList.length && resolvedStoreId ? (
                        <option value={resolvedStoreId}>{restaurantName}</option>
                      ) : null}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                {scheduleClosures.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p className="font-medium">Scheduled closure active or upcoming</p>
                    <button
                      type="button"
                      disabled={schedSaving}
                      className="mt-2 text-sm font-semibold text-amber-950 underline"
                      onClick={() => void cancelScheduledOff()}
                    >
                      Cancel scheduled off
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                  <ScheduleOffDateField
                    label="Start date"
                    value={schedStartDate}
                    onChange={setSchedStartDate}
                  />
                  <ScheduleOffTimeField
                    label="Start time"
                    value={schedStartTime}
                    onChange={setSchedStartTime}
                  />
                  <ScheduleOffDateField
                    label="End date"
                    value={schedEndDate}
                    onChange={setSchedEndDate}
                  />
                  <ScheduleOffTimeField
                    label="End time"
                    value={schedEndTime}
                    onChange={setSchedEndTime}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-black">Reason for turn-off</label>
                  <div className="relative">
                    <select
                      className={`w-full appearance-none rounded-xl border border-gray-300 bg-white py-3 pl-3 pr-10 text-sm shadow-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400 ${
                        schedReason ? 'font-normal text-gray-900' : 'text-gray-400'
                      }`}
                      value={schedReason}
                      onChange={(e) => setSchedReason(e.target.value)}
                    >
                      <option value="">Select a reason</option>
                      {SCHEDULE_OFF_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <button
                    type="button"
                    disabled={schedSaving}
                    className={`w-full rounded-xl py-3.5 text-center text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-55 ${
                      scheduleFormSubmitReady && !schedSaving
                        ? 'bg-black hover:bg-neutral-900 active:bg-neutral-950'
                        : 'bg-gray-500 hover:bg-gray-600'
                    }`}
                    onClick={() => void submitScheduleOff()}
                  >
                    {schedSaving ? 'Saving…' : 'Set this schedule'}
                  </button>
                  <p className="text-center text-xs leading-relaxed text-gray-500">
                    You will not receive any orders in this duration
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <PartnerWaitingOrderSync
        storeId={resolvedStoreId || null}
        isOnline={storeOpen === true}
        hasWaitingInList={hasWaitingPartner}
        onListChange={fetchPartnerNotifications}
      />
      <header
        ref={(n) => { topbarRef.current = n; }}
        className="fixed top-0 left-0 right-0 z-[1000] flex h-14 w-full shrink-0 border-b border-[#e8e8e8] bg-white"
      >
        {/* Left: logo — contained so artwork cannot overlap the title column */}
        <div
          className={`flex h-full shrink-0 items-center justify-start gap-1.5 overflow-hidden border-r border-[#e8e8e8] px-2 md:px-2.5 ${leftW}`}
        >
          <MobileHamburgerButton className="shrink-0 md:hidden" />
          <Link
            href="/partners/dashboard"
            className="flex min-w-0 max-w-full items-center overflow-hidden py-1 hover:opacity-90"
          >
            <Image
              src="/logo.png"
              alt="GatiMitra"
              width={200}
              height={48}
              className="h-8 w-auto max-h-8 max-w-[min(148px,100%)] object-contain object-left sm:h-9 sm:max-h-9 sm:max-w-[168px] md:h-10 md:max-h-10 md:max-w-[188px]"
              priority
            />
          </Link>
        </div>

        {/* Page title (center) — own stacking context so title stays above any stray logo pixels */}
        <div className="relative z-[1] min-w-0 flex-1 bg-white pl-3 pr-2 sm:pl-4 sm:pr-4 flex flex-col justify-center isolate">
          {resolvedHeaderTitle ? (
            <>
              <h1 className="truncate text-sm font-bold text-gray-900 sm:text-base md:text-lg">
                {resolvedHeaderTitle}
              </h1>
              {resolvedHeaderBreadcrumbs.length > 0 ? (
                <nav aria-label="Breadcrumb" className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-[11px] text-gray-500 sm:text-xs">
                  {resolvedHeaderBreadcrumbs.map((crumb, index) => {
                    const isLast = index === resolvedHeaderBreadcrumbs.length - 1;
                    return (
                      <React.Fragment key={`${crumb.label}-${index}`}>
                        {index > 0 ? <ChevronRight size={12} className="shrink-0 text-gray-300" aria-hidden /> : null}
                        {crumb.href && !isLast ? (
                          <Link href={crumb.href} className="truncate hover:text-gray-700">
                            {crumb.label}
                          </Link>
                        ) : (
                          <span className={`truncate ${isLast ? 'font-medium text-gray-700' : ''}`}>
                            {crumb.label}
                          </span>
                        )}
                      </React.Fragment>
                    );
                  })}
                </nav>
              ) : null}
            </>
          ) : (
            <span className="hidden sm:block sm:h-4" aria-hidden />
          )}
        </div>

        {/* Right actions → open sheets */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-4 px-2 sm:px-3 md:px-5">
          {storeOpen === true ? (
            <div className="flex items-center pr-0.5" title="Live" aria-hidden>
              <RadarLiveIndicator />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setSheet((s) => (s === 'notifications' ? null : 'notifications'))}
            className="relative rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            title="Notifications"
            aria-label="Notifications"
            aria-expanded={sheet === 'notifications'}
          >
            <Bell size={20} strokeWidth={1.75} className="text-gray-700" />
            {partnerUnreadCount > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
                {partnerUnreadCount > 99 ? '99+' : partnerUnreadCount}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setSheet((s) => (s === 'settings' ? null : 'settings'))}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            title="Settings"
            aria-label="Settings"
            aria-expanded={sheet === 'settings'}
          >
            <Settings size={20} strokeWidth={1.75} className="text-gray-700" />
          </button>

          {!hideHelpBadge ? (
            <NeedHelpBadge inline variant="headerLink" />
          ) : null}

          <button
            type="button"
            onClick={() => setSheet((s) => (s === 'status' ? null : 'status'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 sm:gap-2 sm:px-2.5 sm:text-sm"
            aria-expanded={sheet === 'status'}
            title={onlineLabel}
          >
            <span className={`h-2 w-2 rounded-full ${onlineGreen ? 'bg-emerald-500' : storeOpen === false ? 'bg-red-500' : 'bg-gray-400'}`} />
            <span className="hidden sm:inline">{onlineLabel}</span>
            <ChevronDown size={14} className="text-gray-500 sm:w-4" />
          </button>

          <div className="border-l border-gray-200 pl-2 md:pl-3">
            <button
              ref={profileTriggerRef}
              type="button"
              onClick={() => {
                setProfileDropdownOpen((o) => !o);
                setPhotoActionMenuOpen(false);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-1.5 py-1 shadow-sm hover:bg-sky-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 sm:gap-2 sm:px-2 sm:py-1.5"
              aria-expanded={profileDropdownOpen}
              aria-haspopup="dialog"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-xs font-bold text-white sm:h-8 sm:w-8 sm:text-sm">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- session or local data URL
                  <img
                    src={avatarSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={() => {
                      if (avatarSrc) setBrokenAvatarSrc(avatarSrc);
                    }}
                  />
                ) : (
                  displayName.charAt(0).toUpperCase()
                )}
              </div>
              <span className="hidden max-w-[88px] truncate text-xs font-medium text-sky-800 sm:max-w-[100px] md:inline md:text-sm">
                {displayName}
              </span>
              {profileDropdownOpen ? (
                <ChevronUp size={14} className="hidden shrink-0 text-sky-700 md:inline sm:w-4" />
              ) : (
                <ChevronDown size={14} className="hidden shrink-0 text-sky-700 md:inline sm:w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {sheet != null &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[1100] flex justify-end" role="presentation">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
              aria-hidden
            />
            <aside
              className={`relative flex h-dvh min-h-0 w-full max-w-md flex-col border-l shadow-2xl ${
                sheet === 'status'
                  ? 'border-slate-200/70 bg-gradient-to-b from-slate-50/90 via-white to-white'
                  : 'border-gray-200 bg-white'
              }`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-sheet-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`mx-sheet-header items-start justify-between gap-2 !h-auto ${
                  sheet === 'status'
                    ? '!min-h-0 border-b border-slate-200/80 !bg-white/85 !px-5 !py-4 backdrop-blur-md sm:!py-4'
                    : '!px-4 !py-3 min-h-[var(--mx-partner-topbar-h)] gap-3'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 id="partner-sheet-title" className="truncate text-sm font-semibold leading-tight text-gray-900 sm:text-base">
                      {sheetTitle[sheet]}
                    </h2>
                    {sheet === 'notifications' && partnerUnreadCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => void markAllPartnerNotificationsRead()}
                        className="shrink-0 text-xs font-semibold text-sky-600 hover:text-sky-800"
                      >
                        Mark all read
                      </button>
                    ) : null}
                  </div>
                  {sheet === 'status' && activeOutletSummary ? (
                    <p className="mt-1 text-xs leading-snug text-gray-700">
                      <span className="mr-1 font-semibold text-emerald-600">ACTIVE OUTLET</span>
                      <span className="font-medium text-gray-800 break-words">{activeOutletSummary.name}</span>
                      <span className="mx-1 text-gray-300">·</span>
                      <span className="font-mono text-[11px] text-gray-600 break-all">{activeOutletSummary.id}</span>
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="shrink-0 self-start rounded-lg p-2 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                  aria-label="Close"
                  onClick={() => setSheet(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div
                className={`min-h-0 flex-1 overflow-y-auto hide-scrollbar ${
                  sheet === 'status' ? 'px-5 py-2 pb-6 md:py-3' : 'p-4'
                }`}
              >
                {sheetBody()}
              </div>
            </aside>
          </div>,
          document.body
        )}

      {profileDropdownOpen &&
        profilePanelPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={profilePanelRef}
            className="fixed z-[1200] max-h-[min(90vh,640px)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl"
            style={{
              top: profilePanelPos.top,
              right: profilePanelPos.right,
              width: profilePanelPos.width,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="partner-profile-title"
          >
            <button
              type="button"
              className="absolute right-2 top-2 z-[1] rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                setProfileDropdownOpen(false);
                setPhotoActionMenuOpen(false);
              }}
            >
              <X size={18} />
            </button>
            <input
              ref={profilePhotoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={parentPhotoBusy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f?.type.startsWith('image/')) {
                  toast.error('Choose an image file');
                  return;
                }
                setParentPhotoBusy(true);
                try {
                  const fd = new FormData();
                  fd.append('file', f);
                  const res = await fetch('/api/merchant-auth/parent-store-logo', {
                    method: 'POST',
                    body: fd,
                    credentials: 'include',
                  });
                  const data = (await res.json().catch(() => ({}))) as {
                    success?: boolean;
                    error?: string;
                  };
                  if (!res.ok || !data.success) {
                    toast.error(data.error || 'Upload failed');
                    return;
                  }
                  setLocalAvatarDataUrl(null);
                  toast.success('Brand logo updated');
                  merchantSession?.refetch?.();
                } catch {
                  toast.error('Upload failed');
                } finally {
                  setParentPhotoBusy(false);
                  setPhotoActionMenuOpen(false);
                }
              }}
            />
            <div
              className="px-5 pb-5 pt-8"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center border-b border-gray-100 pb-4">
                <div className="relative mb-3">
                  <button
                    type="button"
                    className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-2xl font-bold text-white outline-none ring-offset-2 hover:opacity-95 focus-visible:ring-2 focus-visible:ring-sky-400"
                    aria-label="Profile photo options"
                    aria-expanded={photoActionMenuOpen}
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoActionMenuOpen((v) => !v);
                    }}
                  >
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarSrc}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={() => {
                          if (avatarSrc) setBrokenAvatarSrc(avatarSrc);
                        }}
                      />
                    ) : (
                      displayName.charAt(0).toUpperCase()
                    )}
                    <span className="pointer-events-none absolute bottom-0.5 right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white shadow">
                      <Camera size={12} className="text-sky-600" strokeWidth={2.25} />
                    </span>
                  </button>
                  {photoActionMenuOpen ? (
                    <div
                      className="absolute left-1/2 top-[calc(100%+10px)] z-10 w-48 -translate-x-1/2 rounded-lg border border-gray-200 bg-white py-0 shadow-lg"
                      role="menu"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div
                        className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-gray-200 bg-white"
                        aria-hidden
                      />
                      <button
                        type="button"
                        role="menuitem"
                        className="relative block w-full border-b border-gray-100 px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50"
                        onClick={() => {
                          profilePhotoInputRef.current?.click();
                          setPhotoActionMenuOpen(false);
                        }}
                      >
                        Change Photo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        disabled={parentPhotoBusy}
                        className="relative block w-full border-b border-gray-100 px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50"
                        onClick={() => {
                          void (async () => {
                            setPhotoActionMenuOpen(false);
                            setParentPhotoBusy(true);
                            try {
                              const res = await fetch('/api/merchant-auth/parent-store-logo', {
                                method: 'DELETE',
                                credentials: 'include',
                              });
                              const data = (await res.json().catch(() => ({}))) as {
                                success?: boolean;
                                error?: string;
                              };
                              if (!res.ok || !data.success) {
                                toast.error(data.error || 'Could not remove logo');
                                return;
                              }
                              setLocalAvatarDataUrl(null);
                              toast.success('Logo removed');
                              merchantSession?.refetch?.();
                            } catch {
                              toast.error('Could not remove logo');
                            } finally {
                              setParentPhotoBusy(false);
                            }
                          })();
                        }}
                      >
                        Delete Photo
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="relative block w-full px-3 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-50"
                        onClick={() => {
                          setPhotoActionMenuOpen(false);
                          if (effectiveAvatarUrl) {
                            const href =
                              effectiveAvatarUrl.startsWith('/') && typeof window !== 'undefined'
                                ? `${window.location.origin}${effectiveAvatarUrl}`
                                : effectiveAvatarUrl;
                            window.open(href, '_blank', 'noopener,noreferrer');
                          } else {
                            toast.info('No photo to view');
                          }
                        }}
                      >
                        View Photo
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <h2 id="partner-profile-title" className="text-center text-lg font-bold text-gray-900">
                    {displayName}
                  </h2>
                  <Link
                    href={profileHref}
                    className="text-sky-600 hover:text-sky-700"
                    aria-label="Edit profile"
                    onClick={() => {
                      setProfileDropdownOpen(false);
                      setPhotoActionMenuOpen(false);
                    }}
                  >
                    <Pencil size={16} strokeWidth={2} />
                  </Link>
                </div>
                {merchantSession?.user?.phone ? (
                  <p className="mt-2 text-center text-sm text-gray-500">{merchantSession.user.phone}</p>
                ) : null}
                <p className="mt-1 text-center text-sm text-gray-500">
                  {merchantSession?.user?.email ?? ownerEmailResolved ?? ''}
                </p>
              </div>
              <div className="space-y-2.5 border-b border-gray-100 py-4">
                <button
                  type="button"
                  className="w-full rounded-xl bg-[#ff5a5f] py-3 text-sm font-semibold text-white hover:bg-[#f04a50]"
                  onClick={() => {
                    setProfileDropdownOpen(false);
                    setPhotoActionMenuOpen(false);
                    setShowLogoutModal(true);
                  }}
                >
                  Logout
                </button>
                <button
                  type="button"
                  className="w-full rounded-xl border-2 border-[#ff5a5f] py-3 text-sm font-semibold text-[#ff5a5f] hover:bg-rose-50"
                  disabled={isLoggingOut}
                  onClick={() => {
                    if (
                      typeof window !== 'undefined' &&
                      !window.confirm('Sign out from all devices? You will need to sign in again on each device.')
                    ) {
                      return;
                    }
                    void handleLogoutAllDevices();
                  }}
                >
                  Logout from all devices
                </button>
              </div>
              <p className="pt-3 text-center text-xs text-gray-400">
                <a href="https://gatimitra.com" className="hover:underline">
                  Terms of service
                </a>
                <span className="mx-1">|</span>
                <a href="https://gatimitra.com" className="hover:underline">
                  Privacy Policy
                </a>
                <span className="mx-1">|</span>
                <a href="https://gatimitra.com" className="hover:underline">
                  Code of Conduct
                </a>
              </p>
            </div>
          </div>,
          document.body
        )}

      <StoreOperationalFlowModals
        closeTarget={operationalCloseModal}
        openTarget={operationalOpenModal}
        onDismissClose={() => setOperationalCloseModal(null)}
        onDismissOpen={() => setOperationalOpenModal(null)}
        onSuccess={handleOperationalFlowSuccess}
      />

      <PartnerToggleConfirmModal
        isOpen={pendingToggle != null}
        title={toggleConfirmCopy.title}
        message={toggleConfirmCopy.message}
        confirmLabel="Yes, continue"
        onClose={() => {
          if (!toggleConfirmLoading) setPendingToggle(null);
        }}
        onConfirm={() => void confirmToggleAction()}
        isLoading={toggleConfirmLoading}
      />

      <PartnerToggleConfirmModal
        isOpen={pendingStoreSwitch != null}
        title="Switch active outlet?"
        message={
          pendingStoreSwitch
            ? `You are about to manage “${pendingStoreSwitch.storeName}”. The page will reload and dashboard, orders, menu, and settings will show that outlet.`
            : ''
        }
        confirmLabel="Switch outlet"
        cancelLabel="Cancel"
        onClose={() => setPendingStoreSwitch(null)}
        onConfirm={() => {
          if (!pendingStoreSwitch) return;
          const id = pendingStoreSwitch.storeId;
          setPendingStoreSwitch(null);
          switchToStore(id);
        }}
      />

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
      />
    </>
  );
};
