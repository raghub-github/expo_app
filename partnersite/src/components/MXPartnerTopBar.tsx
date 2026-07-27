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
  ChefHat,
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
  Search,
  Volume2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';
import { fetchStoreOperations } from '@/hooks/useMerchantApi';
import { formatStoreActionSourceLabel } from '@/lib/storeActionSource';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { useMerchantSession } from '@/context/MerchantSessionContext';
import { useApprovedPartnerStores } from '@/hooks/usePartnerResolveSession';
import { usePartnerShellHeader } from '@/context/PartnerShellHeaderContext';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { PartnerToggleConfirmModal } from '@/components/PartnerToggleConfirmModal';
import { StoreOperationalFlowModals } from '@/components/StoreOperationalFlowModals';
import { OutsideOperatingHoursModal } from '@/components/OutsideOperatingHoursModal';
import { LicenseExpiredModal } from '@/components/LicenseExpiredModal';
import {
  MANUAL_LOCK_LICENSE_BLOCKED_MESSAGE,
  type LicenseDocumentStatus,
  type MerchantDocumentPrefix,
} from '@/lib/merchantLicenseExpiry';
import { RadarLiveIndicator } from '@/components/RadarLiveIndicator';
import {
  PartnerWaitingOrderSync,
  notificationListHasWaiting,
} from '@/components/PartnerWaitingOrderSync';
import { WAITING_FOR_ORDER_TITLE } from '@/lib/partner-notification-constants';
import { PARTNER_NOTIFICATIONS_CHANGED } from '@/lib/clear-store-order-notifications';
import { dispatchPartnerNotificationsCleared } from '@/lib/partner-notifications-panel';
import { createClient } from '@/lib/supabase/client';
import { clientStoreOpsDebugLog } from '@/lib/store-ops-client-debug';
import { toStoredDocumentUrl } from '@/lib/r2';
import NeedHelpBadge from '@/components/NeedHelpBadge';
import { usePartnerDeviceOrderAlerts } from '@/hooks/usePartnerDeviceOrderAlerts';
import {
  PARTNER_SELECTED_STORE_CHANGED,
  isValidPartnerStoreId,
  persistPartnerManagedStoreIds,
  clearPartnerManagedStoreIds,
  readPartnerManagedStoreIds,
  readPartnerSelectedStoreId,
} from '@/lib/partner-selected-store';
import { partnerSurfaceOnlineFromStoreOperationsBody } from '@/lib/partnerStoreSurfaceOnline';
import { emitPartnerStoreOperationsRefresh } from '@/lib/partnerStoreOperationsRefresh';
import { STORE_SETTINGS_TAB_LABELS } from '@/lib/store-settings-tabs';
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

const RUSH_DURATION_OPTIONS = [
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '1 hour 30 minutes' },
  { minutes: 120, label: '2 hours' },
] as const;

type ScheduleClosureRow = {
  id: number;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  marked_from?: string | null;
};

function isoUtcToLocalDateTimeInputs(iso: string): { ymd: string; hm: string } | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return { ymd: `${y}-${mo}-${day}`, hm: `${hh}:${mi}` };
}

function formatClosureRangeFriendly(startsIso: string, endsIso: string): string {
  try {
    const a = new Date(startsIso);
    const b = new Date(endsIso);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
    const o: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' };
    return `${a.toLocaleString('en-IN', o)} – ${b.toLocaleString('en-IN', o)}`;
  } catch {
    return '';
  }
}

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
  /** Effective “live” indicator: OPEN **and** inside an accepting slot (not break / outside hours). */
  open: boolean | null;
  autoOpen: boolean;
  manualLock: boolean;
  /** From GET /api/store-operations — current time inside an active slot (or 24h). */
  withinOperatingHours?: boolean | null;
  /** OFF_DAY | BREAK | PRE_BREAK | WITHIN_SLOT | OUTSIDE_HOURS | NO_HOURS */
  schedulePhase?: string | null;
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

function OutletSheetCheckbox({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
      className="h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
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
  const queryClient = useQueryClient();
  const userEmail = merchantSession?.user?.email ?? merchantSession?.user?.phone ?? '';

  /** SSR-safe: empty until mount — never treat layout placeholders like "No ID" as store_id. */
  const [resolvedStoreId, setResolvedStoreId] = useState('');
  const { data: resolveSessionData, approvedStores } = useApprovedPartnerStores();
  const storeList = useMemo(
    () =>
      approvedStores.map((s) => ({
        store_id: String(s.store_id),
        store_name: String(s.store_name || s.store_id || 'Store'),
        full_address: typeof s.full_address === 'string' ? s.full_address : '',
        banner_url: typeof s.banner_url === 'string' && s.banner_url.trim() ? s.banner_url.trim() : null,
      })),
    [approvedStores]
  );
  const ownerName = resolveSessionData?.ownerName ?? null;
  const parentName = resolveSessionData?.parentName ?? null;
  const ownerEmailResolved = resolveSessionData?.ownerEmail ?? null;
  const [brokenAvatarSrc, setBrokenAvatarSrc] = useState<string | null>(null);

  const [sheet, setSheet] = useState<PartnerHeaderSheet | null>(null);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [profileHydrated, setProfileHydrated] = useState(false);
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
  const [statusTab, setStatusTab] = useState<'manage' | 'schedule' | 'rush'>('manage');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showLogoutAllModal, setShowLogoutAllModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const [autoOpenFromSchedule, setAutoOpenFromSchedule] = useState(true);
  const [manualLock, setManualLock] = useState(false);
  const [storeOpsById, setStoreOpsById] = useState<Record<string, StoreOpRow>>({});
  const prevSheetRef = useRef<PartnerHeaderSheet | null>(null);
  const [scheduleClosures, setScheduleClosures] = useState<ScheduleClosureRow[]>([]);
  const [scheduleMassCancelModalOpen, setScheduleMassCancelModalOpen] = useState(false);
  const [schedEditingClosureId, setSchedEditingClosureId] = useState<number | null>(null);
  const [scheduleStorePick, setScheduleStorePick] = useState('');
  const [schedStartDate, setSchedStartDate] = useState('');
  const [schedStartTime, setSchedStartTime] = useState('');
  const [schedEndDate, setSchedEndDate] = useState('');
  const [schedEndTime, setSchedEndTime] = useState('');
  const [schedReason, setSchedReason] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);
  const [rushStorePick, setRushStorePick] = useState('');
  const [rushActive, setRushActive] = useState(false);
  const [rushRemaining, setRushRemaining] = useState(0);
  const [rushPick, setRushPick] = useState(60);
  const [rushSaving, setRushSaving] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<PendingOutletToggle | null>(null);
  const [toggleConfirmLoading, setToggleConfirmLoading] = useState(false);
  const [parentPhotoBusy, setParentPhotoBusy] = useState(false);
  const [outletSearchQuery, setOutletSearchQuery] = useState('');
  const [checkedOutletIds, setCheckedOutletIds] = useState<Set<string>>(() => new Set());
  const [pendingStoreSwitch, setPendingStoreSwitch] = useState<{
    storeId: string;
    storeName: string;
    /** Multi-outlet manage confirm (orders land on one board). */
    managedStoreIds?: string[];
  } | null>(null);
  /** Same close / open modals as dashboard store status card (not the simple confirm dialog). */
  const [operationalCloseModal, setOperationalCloseModal] = useState<{ storeId: string; storeName: string } | null>(
    null
  );
  const [operationalOpenModal, setOperationalOpenModal] = useState<{ storeId: string; storeName: string } | null>(null);
  const [outsideHoursModalStoreId, setOutsideHoursModalStoreId] = useState<string | null>(null);
  const [licenseBlocked, setLicenseBlocked] = useState(false);
  const [licenseExpiredDocs, setLicenseExpiredDocs] = useState<LicenseDocumentStatus[]>([]);
  const [licensePendingDocs, setLicensePendingDocs] = useState<LicenseDocumentStatus[]>([]);
  const [licenseModalOpen, setLicenseModalOpen] = useState(false);
  const [licenseModalStoreId, setLicenseModalStoreId] = useState<string | null>(null);
  const licenseModalAutoOpenedRef = useRef(false);
  const [licenseModalInitialPrefix, setLicenseModalInitialPrefix] = useState<MerchantDocumentPrefix | null>(
    null
  );

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
        show_floating_orders: data.show_floating_orders !== false,
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
        } else {
          window.dispatchEvent(new CustomEvent('partner-store-settings-changed'));
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

  const clearAllPartnerNotifications = useCallback(async () => {
    if (!resolvedStoreId || partnerNotifications.length === 0) return;
    const prev = partnerNotifications;
    setPartnerNotifications([]);
    try {
      const res = await fetch('/api/merchant/store-notifications', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: resolvedStoreId, action: 'clear_all' }),
      });
      if (!res.ok) {
        setPartnerNotifications(prev);
        await fetchPartnerNotifications();
        return;
      }
      dispatchPartnerNotificationsCleared(resolvedStoreId);
      window.dispatchEvent(new CustomEvent(PARTNER_NOTIFICATIONS_CHANGED));
    } catch {
      setPartnerNotifications(prev);
      await fetchPartnerNotifications();
    }
  }, [resolvedStoreId, partnerNotifications, fetchPartnerNotifications]);

  useEffect(() => {
    const sync = () => {
      const id = readPartnerSelectedStoreId(restaurantId);
      setResolvedStoreId(isValidPartnerStoreId(id) ? id : '');
    };
    sync();
    const onStore = () => sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'selectedStoreId') sync();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
      window.removeEventListener('storage', onStorage);
    };
  }, [restaurantId]);

  useEffect(() => {
    setProfileHydrated(true);
  }, []);

  const resolvedDisplayName =
    (merchantSession?.user?.name && merchantSession.user.name.trim()) ||
    (ownerName && ownerName.trim()) ||
    (parentName && parentName.trim()) ||
    (userEmail && userEmail.includes('@') ? userEmail.split('@')[0] : userEmail) ||
    'Account';

  const displayName = profileHydrated ? resolvedDisplayName : 'Account';

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

  const applyLicenseFieldsFromStoreOps = useCallback((data: Record<string, unknown>) => {
    const blocked = data.license_blocked === true;
    const expired = Array.isArray(data.license_expired_documents)
      ? (data.license_expired_documents as LicenseDocumentStatus[])
      : [];
    const pending = Array.isArray(data.license_pending_verification)
      ? (data.license_pending_verification as LicenseDocumentStatus[])
      : [];
    setLicenseBlocked(blocked);
    setLicenseExpiredDocs(expired);
    setLicensePendingDocs(pending);
    // Modal opens only when user tries to go online or uploads from profile — not on every poll.
  }, []);

  const refreshStoreOperations = useCallback(async () => {
    if (!resolvedStoreId) return;
    try {
      const data = await queryClient.fetchQuery({
        queryKey: merchantKeys.storeOperations(resolvedStoreId),
        queryFn: () => fetchStoreOperations(resolvedStoreId),
        staleTime: 2 * 60 * 1000,
      });
      if (data && typeof data.operational_status === 'string') {
        applyLicenseFieldsFromStoreOps(data as unknown as Record<string, unknown>);
        const withinH =
          typeof data.within_operating_hours === 'boolean' ? data.within_operating_hours : null;
        const todayClosed =
          typeof data.is_today_scheduled_closed === 'boolean' ? data.is_today_scheduled_closed : null;
        const schedulePhase = typeof data.schedule_phase === 'string' ? data.schedule_phase : null;
        const surfOnline = partnerSurfaceOnlineFromStoreOperationsBody(data as unknown as Record<string, unknown>);
        clientStoreOpsDebugLog('refreshStoreOperations', {
          storeId: resolvedStoreId,
          operational_status: data.operational_status,
          last_toggle_type: data.last_toggle_type,
          within_hours_but_restricted: data.within_hours_but_restricted,
          within_operating_hours: withinH,
          schedule_phase: schedulePhase,
          surface_online: surfOnline,
          is_today_scheduled_closed: todayClosed,
        });
        const autoOpenEnabled = data.auto_open_from_schedule !== false;
        setStoreOpen(surfOnline);
        setAutoOpenFromSchedule(autoOpenEnabled);
        setManualLock(data.block_auto_open === true);
        setStoreOpsById((prev) => ({
          ...prev,
          [resolvedStoreId]: {
            open: surfOnline,
            autoOpen: autoOpenEnabled,
            manualLock: data.block_auto_open === true,
            withinOperatingHours: withinH,
            schedulePhase,
            todayScheduledClosed: todayClosed,
          },
        }));
      } else {
        setStoreOpen(null);
      }
    } catch {
      setStoreOpen(null);
    }
  }, [resolvedStoreId, applyLicenseFieldsFromStoreOps, queryClient]);

  const refetchStoreOp = useCallback(async (storeId: string): Promise<boolean> => {
    if (!storeId) return false;
    try {
      const data = await queryClient.fetchQuery({
        queryKey: merchantKeys.storeOperations(storeId),
        queryFn: () => fetchStoreOperations(storeId),
        staleTime: 2 * 60 * 1000,
      });
      if (data && typeof data.operational_status === 'string') {
        const withinH =
          typeof data.within_operating_hours === 'boolean' ? data.within_operating_hours : null;
        const todayClosed =
          typeof data.is_today_scheduled_closed === 'boolean' ? data.is_today_scheduled_closed : null;
        const schedulePhase = typeof data.schedule_phase === 'string' ? data.schedule_phase : null;
        const surfOnline = partnerSurfaceOnlineFromStoreOperationsBody(data as unknown as Record<string, unknown>);
        clientStoreOpsDebugLog('refetchStoreOp', {
          storeId,
          operational_status: data.operational_status,
          last_toggle_type: data.last_toggle_type,
          last_toggled_at: data.last_toggled_at,
          restriction_type: data.restriction_type,
          within_operating_hours: withinH,
          schedule_phase: schedulePhase,
          surface_online: surfOnline,
          is_today_scheduled_closed: todayClosed,
        });
        const row: StoreOpRow = {
          open: surfOnline,
          autoOpen: data.auto_open_from_schedule !== false,
          manualLock: data.block_auto_open === true,
          withinOperatingHours: withinH,
          schedulePhase,
          todayScheduledClosed: todayClosed,
        };
        setStoreOpsById((prev) => ({ ...prev, [storeId]: row }));
        if (storeId === resolvedStoreId) {
          setStoreOpen(row.open);
          setAutoOpenFromSchedule(row.autoOpen);
          setManualLock(row.manualLock);
          applyLicenseFieldsFromStoreOps(data as unknown as Record<string, unknown>);
        }
        emitPartnerStoreOperationsRefresh(storeId);
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }, [resolvedStoreId, applyLicenseFieldsFromStoreOps, queryClient]);

  const tryOpenStoreAfterLicenseCheck = useCallback(
    async (storeId: string, storeName: string) => {
      const ops = storeOpsById[storeId];
      if (ops?.withinOperatingHours === false || ops?.todayScheduledClosed === true) {
        setOutsideHoursModalStoreId(storeId);
        return;
      }
      try {
        const res = await fetch(
          `/api/merchant/store-documents/status?storeId=${encodeURIComponent(storeId)}`,
          { credentials: 'include' }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && (data as { license_blocked?: boolean }).license_blocked) {
          setLicenseModalStoreId(storeId);
          setLicenseExpiredDocs(
            Array.isArray((data as { license_expired_documents?: LicenseDocumentStatus[] }).license_expired_documents)
              ? ((data as { license_expired_documents: LicenseDocumentStatus[] }).license_expired_documents)
              : []
          );
          setLicensePendingDocs(
            Array.isArray(
              (data as { license_pending_verification?: LicenseDocumentStatus[] }).license_pending_verification
            )
              ? ((data as { license_pending_verification: LicenseDocumentStatus[] }).license_pending_verification)
              : []
          );
          setLicenseBlocked(true);
          setLicenseModalStoreId(storeId);
          setLicenseModalOpen(true);
          return;
        }
      } catch {
        /* fall through to open flow */
      }
      setOperationalOpenModal({ storeId, storeName });
    },
    [storeOpsById]
  );

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
    const t = window.setInterval(refreshStoreOperations, 30_000);
    return () => window.clearInterval(t);
  }, [refreshStoreOperations, resolvedStoreId]);

  useEffect(() => {
    if (!resolvedStoreId) return;
    let lastSyncAt = 0;
    const refreshOnReturn = () => {
      const now = Date.now();
      if (now - lastSyncAt < 1200) return;
      lastSyncAt = now;
      void refreshStoreOperations();
    };
    const onFocus = () => refreshOnReturn();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshOnReturn();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [resolvedStoreId, refreshStoreOperations]);

  useEffect(() => {
    licenseModalAutoOpenedRef.current = false;
  }, [resolvedStoreId]);

  /** Show licence renewal modal once per page load when store is licence-blocked (reappears after refresh). */
  useEffect(() => {
    if (!resolvedStoreId || !licenseBlocked || licenseModalAutoOpenedRef.current) return;
    licenseModalAutoOpenedRef.current = true;
    setLicenseModalStoreId(resolvedStoreId);
    setLicenseModalOpen(true);
  }, [resolvedStoreId, licenseBlocked]);

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
    const onChanged = () => void fetchPartnerNotifications();
    window.addEventListener(PARTNER_NOTIFICATIONS_CHANGED, onChanged);
    return () => window.removeEventListener(PARTNER_NOTIFICATIONS_CHANGED, onChanged);
  }, [fetchPartnerNotifications]);

  // Live inbox: when backend deletes "New order!" on cancel/deliver, refresh immediately.
  useEffect(() => {
    if (!resolvedStoreId || !isValidPartnerStoreId(resolvedStoreId)) return;
    const storePk = Number(resolvedStoreId);
    if (!Number.isFinite(storePk) || storePk <= 0) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`partner_store_notifs:${storePk}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_store_notifications',
          filter: `store_id=eq.${storePk}`,
        },
        () => {
          void fetchPartnerNotifications();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [resolvedStoreId, fetchPartnerNotifications]);

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
      setPendingStoreSwitch(null);
      setOperationalCloseModal(null);
      setOperationalOpenModal(null);
      setScheduleMassCancelModalOpen(false);
    }
  }, [sheet]);

  const refreshScheduleOffList = useCallback(async () => {
    const sid = (scheduleStorePick || resolvedStoreId || '').trim();
    if (!sid) {
      setScheduleClosures([]);
      return;
    }
    try {
      const res = await fetch(`/api/merchant/schedule-off?store_id=${encodeURIComponent(sid)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray((data as { closures?: unknown }).closures)) {
        setScheduleClosures((data as { closures: ScheduleClosureRow[] }).closures);
      } else {
        setScheduleClosures([]);
      }
    } catch {
      setScheduleClosures([]);
    }
  }, [scheduleStorePick, resolvedStoreId]);

  useEffect(() => {
    if (sheet !== 'status') return;
    void refreshScheduleOffList();
  }, [sheet, statusTab, refreshScheduleOffList]);

  useEffect(() => {
    if (resolvedStoreId) setScheduleStorePick(resolvedStoreId);
  }, [resolvedStoreId]);

  useEffect(() => {
    if (resolvedStoreId) setRushStorePick(resolvedStoreId);
  }, [resolvedStoreId]);

  const refreshRushStatus = useCallback(async () => {
    const sid = (rushStorePick || resolvedStoreId || '').trim();
    if (!sid) {
      setRushActive(false);
      setRushRemaining(0);
      return;
    }
    try {
      const res = await fetch(`/api/merchant/rush?store_id=${encodeURIComponent(sid)}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const active = data.is_active === true && Number(data.remaining_minutes) > 0;
        setRushActive(active);
        setRushRemaining(active ? Number(data.remaining_minutes) || 0 : 0);
      } else {
        setRushActive(false);
        setRushRemaining(0);
      }
    } catch {
      setRushActive(false);
      setRushRemaining(0);
    }
  }, [rushStorePick, resolvedStoreId]);

  useEffect(() => {
    if (sheet !== 'status' || statusTab !== 'rush') return;
    void refreshRushStatus();
  }, [sheet, statusTab, refreshRushStatus]);

  const startRushHour = useCallback(async () => {
    const sid = (rushStorePick || resolvedStoreId || '').trim();
    if (!sid) return;
    setRushSaving(true);
    try {
      const res = await fetch('/api/merchant/rush', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: sid, duration_minutes: rushPick }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to start rush hour');
        return;
      }
      toast.success('Rush hour started');
      await refreshRushStatus();
      await refreshStoreOperations();
      if (sid !== resolvedStoreId) await refetchStoreOp(sid);
    } catch {
      toast.error('Failed to start rush hour');
    } finally {
      setRushSaving(false);
    }
  }, [rushStorePick, resolvedStoreId, rushPick, refreshRushStatus, refreshStoreOperations, refetchStoreOp]);

  const stopRushHour = useCallback(async () => {
    const sid = (rushStorePick || resolvedStoreId || '').trim();
    if (!sid) return;
    setRushSaving(true);
    try {
      const res = await fetch('/api/merchant/rush', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_id: sid, is_active: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === 'string' ? data.error : 'Failed to end rush hour');
        return;
      }
      toast.success('Rush hour ended');
      await refreshRushStatus();
      await refreshStoreOperations();
      if (sid !== resolvedStoreId) await refetchStoreOp(sid);
    } catch {
      toast.error('Failed to end rush hour');
    } finally {
      setRushSaving(false);
    }
  }, [rushStorePick, resolvedStoreId, refreshRushStatus, refreshStoreOperations, refetchStoreOp]);

  const switchToStore = (id: string, managedIds?: string[]) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('selectedStoreId', id);
      persistPartnerManagedStoreIds(managedIds?.length ? managedIds : [id]);
      void import('@/lib/partner-selected-store').then((m) => m.notifyPartnerSelectedStoreChanged(id));
    }
    setSheet(null);
    const base = (pathname || '/partners/dashboard').split('?')[0];
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.set('storeId', id);
    window.location.href = `${base}?${params.toString()}`;
  };

  const goToAllStores = () => {
    setSheet(null);
    // ?picker=1 keeps the hub visible even when only one child (add / manage stores).
    window.location.href = '/partners/all-stores?picker=1';
  };

  const clearPartnerLocalStorage = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('restaurantId');
    localStorage.removeItem('restaurantName');
    localStorage.removeItem('selectedStoreId');
    localStorage.removeItem('storeList');
    clearPartnerManagedStoreIds();
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
      setShowLogoutAllModal(false);
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
        schedulePhase: p[storeId]?.schedulePhase ?? null,
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
            schedulePhase: p[storeId]?.schedulePhase ?? null,
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
          schedulePhase: p[storeId]?.schedulePhase ?? null,
          todayScheduledClosed: p[storeId]?.todayScheduledClosed ?? null,
        },
      }));
      if (storeId === resolvedStoreId) setAutoOpenFromSchedule(prev);
      toast.error('Could not update auto-open setting');
    }
  };

  const persistManualLockFor = async (storeId: string, enabled: boolean) => {
    if (!storeId) return;
    if (storeId === resolvedStoreId && licenseBlocked) {
      toast.error(MANUAL_LOCK_LICENSE_BLOCKED_MESSAGE);
      return;
    }
    const prevRow = storeOpsById[storeId];
    const prev = prevRow?.manualLock ?? false;
    setStoreOpsById((p) => ({
      ...p,
      [storeId]: {
        open: p[storeId]?.open ?? null,
        autoOpen: p[storeId]?.autoOpen ?? true,
        manualLock: enabled,
        withinOperatingHours: p[storeId]?.withinOperatingHours ?? null,
        schedulePhase: p[storeId]?.schedulePhase ?? null,
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
            schedulePhase: p[storeId]?.schedulePhase ?? null,
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
          schedulePhase: p[storeId]?.schedulePhase ?? null,
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
      const editingId = schedEditingClosureId;

      const res =
        editingId != null
          ? await fetch('/api/merchant/schedule-off', {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                store_id: sid,
                closure_id: editingId,
                reason: schedReason,
                starts_at: startsAt,
                ends_at: endsAt,
              }),
            })
          : await fetch('/api/merchant/schedule-off', {
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
      toast.success(editingId != null ? 'Scheduled time-off updated' : 'Scheduled time-off set');
      setSchedEditingClosureId(null);
      setSchedReason('');
      setSchedStartDate('');
      setSchedStartTime('');
      setSchedEndDate('');
      setSchedEndTime('');
      await refreshScheduleOffList();
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
      toast.success('All scheduled time-offs cancelled');
      setSchedEditingClosureId(null);
      setSchedReason('');
      setSchedStartDate('');
      setSchedStartTime('');
      setSchedEndDate('');
      setSchedEndTime('');
      setScheduleMassCancelModalOpen(false);
      await refreshScheduleOffList();
      await refetchStoreOp(sid);
    } catch {
      toast.error('Could not cancel schedule');
    } finally {
      setSchedSaving(false);
    }
  };

  const removeScheduledClosureRow = async (closureId: number) => {
    const sid = scheduleStorePick || resolvedStoreId;
    if (!sid) return;
    setSchedSaving(true);
    try {
      const res = await fetch(
        `/api/merchant/schedule-off?store_id=${encodeURIComponent(sid)}&closure_id=${encodeURIComponent(String(closureId))}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) {
        toast.error('Could not remove this schedule');
        return;
      }
      toast.success('Scheduled time-off removed');
      setSchedEditingClosureId((cur) => (cur === closureId ? null : cur));
      await refreshScheduleOffList();
      await refetchStoreOp(sid);
    } catch {
      toast.error('Could not remove schedule');
    } finally {
      setSchedSaving(false);
    }
  };

  const beginEditScheduleClosure = (row: ScheduleClosureRow) => {
    const s = isoUtcToLocalDateTimeInputs(row.starts_at);
    const e = isoUtcToLocalDateTimeInputs(row.ends_at);
    if (!s || !e) {
      toast.error('Could not read this schedule');
      return;
    }
    setSchedEditingClosureId(row.id);
    setSchedStartDate(s.ymd);
    setSchedStartTime(s.hm);
    setSchedEndDate(e.ymd);
    setSchedEndTime(e.hm);
    const r =
      typeof row.reason === 'string' && row.reason.trim().length > 0 ? row.reason.trim() : '';
    setSchedReason(r);
  };

  const cancelScheduleDraft = () => {
    setSchedEditingClosureId(null);
    setSchedReason('');
    setSchedStartDate('');
    setSchedStartTime('');
    setSchedEndDate('');
    setSchedEndTime('');
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

  const leftW = sidebarCollapsed ? 'md:w-14 md:min-w-[13rem]' : 'md:w-52';
  const resolvedOpsRow = resolvedStoreId ? storeOpsById[resolvedStoreId] : undefined;
  const onlineLabel =
    storeOpen === null
      ? 'Status'
      : storeOpen
        ? 'Online'
        : resolvedOpsRow?.todayScheduledClosed === true
          ? 'Offline · Closed today'
          : resolvedOpsRow?.schedulePhase === 'BREAK'
            ? 'Offline · Break'
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
      'refund-policy': 'Refund & Cancellation Policy',
      'user-insights': 'User Insights',
      'support-inbox': 'Support Inbox',
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
        ? STORE_SETTINGS_TAB_LABELS[storeSettingsTab] || 'Store Settings'
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

  const filteredOutletsForStatus = useMemo(() => {
    const q = outletSearchQuery.trim().toLowerCase();
    if (!q) return outletsOrderedForStatus;
    return outletsOrderedForStatus.filter((s) => {
      const name = String(s.store_name ?? '').toLowerCase();
      const id = String(s.store_id ?? '').toLowerCase();
      const addr = String(s.full_address ?? '').toLowerCase();
      return name.includes(q) || id.includes(q) || addr.includes(q);
    });
  }, [outletsOrderedForStatus, outletSearchQuery]);

  const allFilteredOutletsChecked =
    filteredOutletsForStatus.length > 0 &&
    filteredOutletsForStatus.every((s) => checkedOutletIds.has(s.store_id));

  const toggleOutletChecked = useCallback((storeId: string) => {
    setCheckedOutletIds((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }, []);

  const toggleAllFilteredOutlets = useCallback(() => {
    setCheckedOutletIds((prev) => {
      const next = new Set(prev);
      if (allFilteredOutletsChecked) {
        filteredOutletsForStatus.forEach((s) => next.delete(s.store_id));
      } else {
        filteredOutletsForStatus.forEach((s) => next.add(s.store_id));
      }
      return next;
    });
  }, [allFilteredOutletsChecked, filteredOutletsForStatus]);

  const confirmOutletSelection = useCallback(() => {
    const ids = [...checkedOutletIds];
    if (ids.length === 0) return;
    const primary =
      (resolvedStoreId && checkedOutletIds.has(resolvedStoreId) ? resolvedStoreId : null) ?? ids[0]!;
    const primaryStore = displayStores.find((s) => s.store_id === primary);
    if (!primaryStore) return;

    if (ids.length === 1) {
      if (primary === resolvedStoreId) {
        persistPartnerManagedStoreIds([primary]);
        setSheet(null);
        return;
      }
      setPendingStoreSwitch({
        storeId: primaryStore.store_id,
        storeName: primaryStore.store_name,
        managedStoreIds: [primary],
      });
      return;
    }

    setPendingStoreSwitch({
      storeId: primaryStore.store_id,
      storeName: primaryStore.store_name,
      managedStoreIds: ids,
    });
  }, [checkedOutletIds, resolvedStoreId, displayStores]);

  useEffect(() => {
    if (sheet === 'status' && statusTab === 'manage') {
      setOutletSearchQuery('');
      const managed = readPartnerManagedStoreIds(resolvedStoreId);
      if (managed.length > 0) {
        setCheckedOutletIds(new Set(managed));
      } else if (resolvedStoreId) {
        setCheckedOutletIds(new Set([resolvedStoreId]));
      }
    }
  }, [sheet, statusTab, resolvedStoreId]);

  const sheetBody = () => {
    if (!sheet) return null;
    switch (sheet) {
      case 'notifications':
        return (
          <div className="space-y-0">
            {partnerNotifications.length > 0 ? (
              <div className="mb-2 flex items-center gap-3 border-b border-gray-100 pb-2">
                {partnerUnreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => void markAllPartnerNotificationsRead()}
                    className="text-xs font-semibold text-sky-600 hover:text-sky-800"
                  >
                    Mark all read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void clearAllPartnerNotifications()}
                  className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800"
                >
                  Clear all
                </button>
              </div>
            ) : null}
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
                className={`flex-1 rounded-xl py-2 text-[11px] sm:text-sm font-semibold transition-all ${
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
                className={`flex-1 rounded-xl py-2 text-[11px] sm:text-sm font-semibold transition-all ${
                  statusTab === 'schedule'
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setStatusTab('schedule')}
              >
                Time-off
              </button>
              <button
                type="button"
                className={`flex-1 rounded-xl py-2 text-[11px] sm:text-sm font-semibold transition-all ${
                  statusTab === 'rush'
                    ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setStatusTab('rush')}
              >
                Rush hour
              </button>
            </div>

            {statusTab === 'manage' ? (
              <div className="space-y-5">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200/90 bg-white py-3.5 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-100 transition hover:border-sky-200/80 hover:bg-sky-50/60 hover:text-sky-950"
                  onClick={() => {
                    setSheet(null);
                    router.push('/partners/all-stores?picker=1');
                  }}
                >
                  View all outlets
                  <ChevronRight className="h-4 w-4 text-sky-600" aria-hidden />
                </button>

                <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-b from-white to-slate-50/40 p-3 shadow-[0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-slate-100/90">
                  <div className="relative mb-3">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                      aria-hidden
                    />
                    <input
                      type="search"
                      value={outletSearchQuery}
                      onChange={(e) => setOutletSearchQuery(e.target.value)}
                      placeholder="Search restaurant name or ID"
                      className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </div>

                  <button
                    type="button"
                    className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left"
                    onClick={toggleAllFilteredOutlets}
                  >
                    <span className="text-sm font-bold text-slate-900">
                      All Restaurants ({outletsOrderedForStatus.length})
                    </span>
                    <OutletSheetCheckbox
                      checked={allFilteredOutletsChecked}
                      onChange={toggleAllFilteredOutlets}
                      ariaLabel="Select all restaurants"
                    />
                  </button>

                  {outletsOrderedForStatus.length === 0 ? (
                    <p className="py-4 text-center text-xs text-gray-500">No approved stores yet.</p>
                  ) : (
                    <ul className="scrollbar-hide max-h-[min(48vh,300px)] overflow-y-auto">
                      {filteredOutletsForStatus.map((s, index) => {
                        const row = storeOpsById[s.store_id];
                        const isOn = row?.open;
                        const isCurrent = s.store_id === resolvedStoreId;
                        const locality =
                          s.full_address?.split(',').slice(-2).join(', ').trim() ||
                          s.full_address?.split(',').pop()?.trim() ||
                          s.full_address ||
                          '';
                        const statusLabel =
                          isOn == null
                            ? 'Unknown'
                            : isOn
                              ? 'Online'
                              : row?.todayScheduledClosed === true
                                ? 'Closed today'
                                : row?.schedulePhase === 'BREAK'
                                  ? 'Break'
                                  : row?.withinOperatingHours === false
                                    ? 'Outside hours'
                                    : 'Offline';
                        const statusDotClass =
                          isOn == null
                            ? 'bg-gray-400'
                            : isOn
                              ? 'bg-emerald-500'
                              : 'bg-rose-400';
                        const isChecked = checkedOutletIds.has(s.store_id);
                        return (
                          <li key={s.store_id}>
                            {index > 0 ? (
                              <div className="my-1 border-t border-dashed border-slate-200" />
                            ) : null}
                            <div
                              className={`flex items-start gap-2.5 rounded-lg border bg-white px-2.5 py-2.5 shadow-sm transition-colors ${
                                isCurrent
                                  ? 'border-sky-200/90 ring-1 ring-sky-100'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <OutletBannerThumb url={s.banner_url} />
                              <button
                                type="button"
                                className="min-w-0 flex-1 text-left"
                                onClick={() => toggleOutletChecked(s.store_id)}
                              >
                                <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5">
                                  <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass}`} />
                                  <span className="text-[10px] font-semibold text-slate-600">
                                    {statusLabel}
                                  </span>
                                </span>
                                <p
                                  className="text-[13px] font-semibold leading-tight text-gray-900"
                                  title={s.store_name}
                                >
                                  {s.store_name}
                                </p>
                                {locality ? (
                                  <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{locality}</p>
                                ) : null}
                                <p className="mt-0.5 text-[11px] text-gray-500">
                                  <span className="font-medium">ID:</span>{' '}
                                  <span className="font-mono text-gray-600">{s.store_id}</span>
                                </p>
                              </button>
                              <div className="flex shrink-0 flex-col items-end gap-2 pt-0.5">
                                <OutletSheetCheckbox
                                  checked={isChecked}
                                  onChange={() => toggleOutletChecked(s.store_id)}
                                  ariaLabel={`Select ${s.store_name}`}
                                />
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
                                    } else if (s.store_id === resolvedStoreId && licenseBlocked) {
                                      setLicenseModalStoreId(s.store_id);
                                      setLicenseModalOpen(true);
                                    } else if (s.store_id !== resolvedStoreId) {
                                      void tryOpenStoreAfterLicenseCheck(s.store_id, s.store_name);
                                    } else {
                                      const ops = storeOpsById[s.store_id];
                                      if (
                                        ops?.withinOperatingHours === false ||
                                        ops?.todayScheduledClosed === true
                                      ) {
                                        setOutsideHoursModalStoreId(s.store_id);
                                      } else {
                                        setOperationalOpenModal({
                                          storeId: s.store_id,
                                          storeName: s.store_name,
                                        });
                                      }
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </li>
                        );
                      })}
                      {filteredOutletsForStatus.length === 0 ? (
                        <li className="py-6 text-center text-xs text-gray-500">
                          No restaurants match your search.
                        </li>
                      ) : null}
                    </ul>
                  )}

                  {outletsOrderedForStatus.length > 1 ? (
                    <button
                      type="button"
                      disabled={checkedOutletIds.size === 0}
                      onClick={confirmOutletSelection}
                      className="mt-3 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {checkedOutletIds.size === 1
                        ? 'Confirm (1 restaurant)'
                        : `Confirm (${checkedOutletIds.size} restaurants)`}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : statusTab === 'schedule' ? (
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

                {scheduleClosures.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 space-y-2">
                    <p className="text-[13px] font-semibold tracking-tight">Scheduled time-off</p>
                    <ul className="space-y-2">
                      {scheduleClosures.map((c) => (
                        <li
                          key={c.id}
                          className="rounded-lg border border-amber-200/80 bg-white/70 px-2.5 py-2 shadow-sm"
                        >
                          <p className="text-[13px] font-semibold text-amber-950 leading-snug">
                            {typeof c.reason === 'string' && c.reason.trim() !== ''
                              ? c.reason.trim()
                              : 'Scheduled closure'}
                          </p>
                          <p className="mt-1 text-[11px] font-medium leading-relaxed text-amber-900/90">
                            {formatClosureRangeFriendly(c.starts_at, c.ends_at)}
                          </p>
                          {c.marked_from ? (
                            <p className="mt-1 text-[10px] font-medium text-amber-800/90">
                              Set via {formatStoreActionSourceLabel(c.marked_from) ?? c.marked_from}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <button
                              type="button"
                              disabled={schedSaving}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-amber-950 underline decoration-amber-800/70 underline-offset-2 hover:text-black disabled:opacity-50"
                              onClick={() => beginEditScheduleClosure(c)}
                            >
                              <Pencil className="h-3 w-3" aria-hidden />
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={schedSaving}
                              className="inline-flex items-center gap-1 text-[12px] font-semibold text-rose-800 underline underline-offset-2 hover:text-rose-950 disabled:opacity-50"
                              onClick={() => void removeScheduledClosureRow(c.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={schedSaving}
                      className="text-[12px] font-semibold text-amber-950 underline underline-offset-2 hover:text-black disabled:opacity-50"
                      onClick={() => {
                        void refreshScheduleOffList();
                        setScheduleMassCancelModalOpen(true);
                      }}
                    >
                      Cancel all schedules
                    </button>
                  </div>
                ) : null}

                {schedEditingClosureId != null && (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-950">
                    <span className="font-medium">Editing a scheduled closure — save or cancel.</span>
                    <button
                      type="button"
                      disabled={schedSaving}
                      className="shrink-0 font-semibold text-sky-900 underline underline-offset-2 disabled:opacity-50"
                      onClick={cancelScheduleDraft}
                    >
                      Cancel edit
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
                      {schedReason &&
                      !SCHEDULE_OFF_REASONS.some((r) => r === schedReason) ? (
                        <option value={schedReason}>{schedReason}</option>
                      ) : null}
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
                    {schedSaving ? 'Saving…' : schedEditingClosureId != null ? 'Save changes' : 'Set this schedule'}
                  </button>
                  <p className="text-center text-xs leading-relaxed text-gray-500">
                    You will not receive any orders in this duration
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5 pb-1">
                <div>
                  <label className="mb-2 block text-sm font-bold tracking-tight text-slate-900">
                    Select a restaurant
                  </label>
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-1/2 z-[1] h-[18px] w-[18px] -translate-y-1/2 text-gray-400"
                      aria-hidden
                    />
                    <select
                      className="w-full min-w-0 appearance-none truncate rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-10 text-left text-sm font-normal text-gray-900 shadow-sm outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                      value={rushStorePick}
                      onChange={(e) => setRushStorePick(e.target.value)}
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

                <div className="rounded-2xl border border-orange-200/80 bg-orange-50/50 p-4 ring-1 ring-orange-100">
                  <div className="flex items-center gap-2 text-orange-950">
                    <ChefHat className="h-5 w-5 shrink-0" aria-hidden />
                    <p className="text-sm font-bold">Rush hour</p>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-orange-900/90">
                    Adds extra preparation time for new orders. Same as the merchant app Preparation Time screen.
                  </p>
                  {rushActive ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm font-semibold text-orange-900">
                        Active · ~{rushRemaining} minutes remaining
                      </p>
                      <button
                        type="button"
                        disabled={rushSaving}
                        className="w-full rounded-xl border border-orange-300 bg-white py-3 text-sm font-semibold text-orange-900 disabled:opacity-50"
                        onClick={() => void stopRushHour()}
                      >
                        {rushSaving ? 'Ending…' : 'End rush hour'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        {RUSH_DURATION_OPTIONS.map((o) => (
                          <button
                            key={o.minutes}
                            type="button"
                            onClick={() => setRushPick(o.minutes)}
                            className={`rounded-xl border py-2.5 text-sm font-semibold ${
                              rushPick === o.minutes
                                ? 'border-orange-500 bg-white text-orange-900 shadow-sm'
                                : 'border-orange-200/80 bg-white/60 text-orange-950 hover:bg-white'
                            }`}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={rushSaving}
                        className="mt-3 w-full rounded-xl bg-orange-600 py-3.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                        onClick={() => void startRushHour()}
                      >
                        {rushSaving ? 'Starting…' : 'Start rush hour'}
                      </button>
                    </>
                  )}
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
                    : sheet === 'notifications'
                      ? '!min-h-0 !px-4 !py-2 items-center gap-2'
                      : '!px-4 !py-3 min-h-[var(--mx-partner-topbar-h)] gap-3'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <h2 id="partner-sheet-title" className="truncate text-sm font-semibold leading-tight text-gray-900 sm:text-base">
                    {sheetTitle[sheet]}
                  </h2>
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
                  className="shrink-0 self-start rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                  aria-label="Close"
                  onClick={() => setSheet(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <div
                className={`min-h-0 flex-1 overflow-y-auto hide-scrollbar ${
                  sheet === 'status' ? 'px-5 py-2 pb-6 md:py-3' : sheet === 'notifications' ? 'px-4 pt-2 pb-4' : 'p-4'
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
                    setProfileDropdownOpen(false);
                    setPhotoActionMenuOpen(false);
                    setShowLogoutAllModal(true);
                  }}
                >
                  Logout from all devices
                </button>
              </div>
              <p className="pt-3 text-center text-xs text-gray-500">
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Terms of service
                </a>
                <span className="mx-1 text-gray-300">|</span>
                <a
                  href="/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Privacy Policy
                </a>
                <span className="mx-1 text-gray-300">|</span>
                <a
                  href="/coc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-emerald-600 hover:text-emerald-700 hover:underline"
                >
                  Code of Conduct
                </a>
              </p>
            </div>
          </div>,
          document.body
        )}

      <LicenseExpiredModal
        storeId={licenseModalStoreId || resolvedStoreId || ''}
        open={licenseModalOpen && !!(licenseModalStoreId || resolvedStoreId)}
        expired={licenseExpiredDocs}
        pendingVerification={licensePendingDocs}
        initialStepPrefix={licenseModalInitialPrefix}
        onClose={() => {
          setLicenseModalOpen(false);
          setLicenseModalInitialPrefix(null);
        }}
        onUploaded={async () => {
          const sid = licenseModalStoreId || resolvedStoreId;
          if (sid) await refetchStoreOp(sid);
          await refreshStoreOperations();
        }}
      />

      <StoreOperationalFlowModals
        closeTarget={operationalCloseModal}
        openTarget={operationalOpenModal}
        onDismissClose={() => setOperationalCloseModal(null)}
        onDismissOpen={() => setOperationalOpenModal(null)}
        onSuccess={handleOperationalFlowSuccess}
      />

      <OutsideOperatingHoursModal
        open={outsideHoursModalStoreId != null}
        onClose={() => setOutsideHoursModalStoreId(null)}
        storeId={outsideHoursModalStoreId}
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
        title={
          pendingStoreSwitch?.managedStoreIds && pendingStoreSwitch.managedStoreIds.length > 1
            ? `Confirm (${pendingStoreSwitch.managedStoreIds.length} restaurants)`
            : 'Switch active outlet?'
        }
        message={
          pendingStoreSwitch?.managedStoreIds && pendingStoreSwitch.managedStoreIds.length > 1
            ? `After you confirm, new orders from all ${pendingStoreSwitch.managedStoreIds.length} selected restaurants will land on this same orders board. Each incoming order will show the store locality so you know which outlet it belongs to.`
            : pendingStoreSwitch
              ? `You are about to manage “${pendingStoreSwitch.storeName}”. The page will reload and dashboard, orders, menu, and settings will show that outlet.`
              : ''
        }
        confirmLabel={
          pendingStoreSwitch?.managedStoreIds && pendingStoreSwitch.managedStoreIds.length > 1
            ? 'Confirm'
            : 'Switch outlet'
        }
        cancelLabel="Cancel"
        onClose={() => setPendingStoreSwitch(null)}
        onConfirm={() => {
          if (!pendingStoreSwitch) return;
          const id = pendingStoreSwitch.storeId;
          const managed = pendingStoreSwitch.managedStoreIds ?? [id];
          setPendingStoreSwitch(null);
          if (managed.length > 1 && id === resolvedStoreId) {
            persistPartnerManagedStoreIds(managed);
            setSheet(null);
            toast.success(
              `Managing orders from ${managed.length} restaurants on this board`
            );
            return;
          }
          switchToStore(id, managed);
        }}
      />

      <LogoutConfirmModal
        isOpen={showLogoutModal}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
        isLoading={isLoggingOut}
      />

      <LogoutConfirmModal
        isOpen={showLogoutAllModal}
        onClose={() => setShowLogoutAllModal(false)}
        onConfirm={handleLogoutAllDevices}
        isLoading={isLoggingOut}
        variant="all-devices"
      />

      {scheduleMassCancelModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[1250] flex items-end justify-center p-0 sm:items-center sm:p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
              aria-label="Close dialog"
              disabled={schedSaving}
              onClick={() => {
                if (!schedSaving) setScheduleMassCancelModalOpen(false);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="schedule-mass-cancel-title"
              className="relative flex max-h-[min(560px,88dvh)] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/10 sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
                <div className="min-w-0">
                  <h2 id="schedule-mass-cancel-title" className="text-base font-bold text-slate-900">
                    Cancel scheduled time-offs
                  </h2>
                  <p className="mt-1 text-xs leading-snug text-slate-600">
                    Remove individual slots or clear every schedule. The outlet then follows normal opening hours again.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={schedSaving}
                  className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
                  aria-label="Close"
                  onClick={() => {
                    if (!schedSaving) setScheduleMassCancelModalOpen(false);
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-3">
                <button
                  type="button"
                  disabled={schedSaving || scheduleClosures.length === 0}
                  className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2.5 text-center text-sm font-semibold text-rose-800 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void cancelScheduledOff()}
                >
                  {schedSaving ? 'Working…' : 'Remove all scheduled'}
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {scheduleClosures.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">No scheduled time-offs for this outlet.</p>
                ) : (
                  <ul className="space-y-2">
                    {scheduleClosures.map((c) => (
                      <li
                        key={c.id}
                        className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-slate-900">
                            {typeof c.reason === 'string' && c.reason.trim() !== ''
                              ? c.reason.trim()
                              : 'Scheduled closure'}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-slate-600">
                            {formatClosureRangeFriendly(c.starts_at, c.ends_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={schedSaving}
                          className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void removeScheduledClosureRow(c.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-200 px-4 py-3">
                <button
                  type="button"
                  disabled={schedSaving}
                  className="w-full rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-200 disabled:opacity-50"
                  onClick={() => {
                    if (!schedSaving) setScheduleMassCancelModalOpen(false);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
