'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  Calendar,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Settings,
  Store,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';
import { useMerchantSession } from '@/context/MerchantSessionContext';
import { usePartnerShellHeader } from '@/context/PartnerShellHeaderContext';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { PartnerToggleConfirmModal } from '@/components/PartnerToggleConfirmModal';
import { StoreOperationalFlowModals } from '@/components/StoreOperationalFlowModals';
import { clientStoreOpsDebugLog } from '@/lib/store-ops-client-debug';

export type PartnerHeaderSheet = 'notifications' | 'settings' | 'status';

type PendingOutletToggle =
  | { kind: 'autoOpen'; storeId: string; nextEnabled: boolean }
  | { kind: 'manualLock'; storeId: string; nextEnabled: boolean };

const SCHEDULE_OFF_REASONS = [
  'Renovation or relocation of restaurant',
  'Closed due to festival',
  'Permanently shut',
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

type StoreOpRow = { open: boolean | null; autoOpen: boolean; manualLock: boolean };

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
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [url]);
  if (!url?.trim() || broken) {
    return (
      <div
        className="h-12 w-14 shrink-0 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200/90"
        aria-hidden
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className="h-12 w-14 shrink-0 rounded-lg border border-slate-200/80 bg-slate-100 object-cover"
      onError={() => setBroken(true)}
    />
  );
}

interface MXPartnerTopBarProps {
  restaurantName?: string;
  restaurantId?: string;
  sidebarCollapsed: boolean;
  /** Page heading in the top bar (replaces in-content title on some pages) */
  headerTitle?: string;
  headerSubtitle?: string;
}

export const MXPartnerTopBar: React.FC<MXPartnerTopBarProps> = ({
  restaurantName = 'Store',
  restaurantId,
  sidebarCollapsed,
  headerTitle,
  headerSubtitle,
}) => {
  const router = useRouter();
  const pathname = usePathname();
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
  const [statusTab, setStatusTab] = useState<'manage' | 'schedule'>('manage');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [storeOpen, setStoreOpen] = useState<boolean | null>(null);
  const [autoOpenFromSchedule, setAutoOpenFromSchedule] = useState(true);
  const [manualLock, setManualLock] = useState(false);
  const [storeOpsById, setStoreOpsById] = useState<Record<string, StoreOpRow>>({});
  const [automationStoreId, setAutomationStoreId] = useState('');
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
  const [refreshAllBusy, setRefreshAllBusy] = useState(false);
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
  const parentBrandLogo = merchantSession?.parent?.store_logo?.trim() || null;
  const effectiveAvatarUrl = localAvatarDataUrl || sessionAvatarUrl || parentBrandLogo;

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
        clientStoreOpsDebugLog('refreshStoreOperations', {
          storeId: resolvedStoreId,
          operational_status: data.operational_status,
          last_toggle_type: (data as { last_toggle_type?: string }).last_toggle_type,
          within_hours_but_restricted: (data as { within_hours_but_restricted?: boolean })
            .within_hours_but_restricted,
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
        clientStoreOpsDebugLog('refetchStoreOp', {
          storeId,
          operational_status: data.operational_status,
          last_toggle_type: (data as { last_toggle_type?: string }).last_toggle_type,
          last_toggled_at: (data as { last_toggled_at?: string }).last_toggled_at,
          restriction_type: (data as { restriction_type?: string }).restriction_type,
        });
        const row: StoreOpRow = {
          open: data.operational_status === 'OPEN',
          autoOpen: data.auto_open_from_schedule !== false,
          manualLock: data.block_auto_open === true,
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

  const handleRefreshAllOutlets = useCallback(async () => {
    setRefreshAllBusy(true);
    try {
      const { ok, total } = await refetchAllStoreOps();
      if (total === 0) {
        toast.message('No outlets to refresh');
      } else if (ok === total) {
        toast.success('Outlets refreshed successfully');
      } else if (ok > 0) {
        toast.success(`Refreshed ${ok} of ${total} outlets`);
      } else {
        toast.error('Could not refresh outlet status');
      }
    } catch {
      toast.error('Could not refresh outlets');
    } finally {
      setRefreshAllBusy(false);
    }
  }, [refetchAllStoreOps]);

  useEffect(() => {
    if (!resolvedStoreId) return;
    refreshStoreOperations();
    const t = window.setInterval(refreshStoreOperations, 60_000);
    return () => window.clearInterval(t);
  }, [refreshStoreOperations, resolvedStoreId]);

  useEffect(() => {
    if (sheet !== 'status') return;
    void refetchAllStoreOps();
  }, [sheet, refetchAllStoreOps]);

  useEffect(() => {
    if (sheet === 'status' && prevSheetRef.current !== 'status' && resolvedStoreId) {
      setAutomationStoreId(resolvedStoreId);
    }
    prevSheetRef.current = sheet;
  }, [sheet, resolvedStoreId]);

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
    const base = (pathname || '/mx/dashboard').split('?')[0];
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    params.set('storeId', id);
    window.location.href = `${base}?${params.toString()}`;
  };

  const goToAllStores = () => {
    setSheet(null);
    window.location.href = '/auth/post-login';
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
        },
      }));
      if (storeId === resolvedStoreId) setManualLock(prev);
      toast.error('Could not update manual lock');
    }
  };

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
    const permanent = schedReason === 'Permanently shut';
    if (!permanent) {
      const startsAt = combineLocalDateTime(schedStartDate, schedStartTime);
      const endsAt = combineLocalDateTime(schedEndDate, schedEndTime);
      if (!startsAt || !endsAt || endsAt.getTime() <= startsAt.getTime()) {
        toast.error('Enter valid start and end date/time');
        return;
      }
    }
    setSchedSaving(true);
    try {
      const startsAt = permanent
        ? null
        : combineLocalDateTime(schedStartDate, schedStartTime)!.toISOString();
      const endsAt = permanent
        ? null
        : combineLocalDateTime(schedEndDate, schedEndTime)!.toISOString();
      const res = await fetch('/api/merchant/schedule-off', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: sid,
          reason: schedReason,
          permanent,
          starts_at: startsAt,
          ends_at: endsAt,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as any).message || (data as any).error || 'Schedule failed');
        return;
      }
      toast.success(permanent ? 'Permanent closure recorded' : 'Scheduled time-off set');
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
  const onlineLabel = storeOpen === null ? 'Status' : storeOpen ? 'Online' : 'Offline';
  const onlineGreen = storeOpen === true;

  const q = resolvedStoreId ? `?storeId=${encodeURIComponent(resolvedStoreId)}` : '';
  const settingsHref = `/mx/store-settings${q}`;
  const insightsHref = `/mx/user-insights${q}`;
  const profileHref = `/mx/profile${q}`;

  const resolvedHeaderTitle = (
    partnerShellHeader?.header.title?.trim() ||
    headerTitle ||
    ''
  ).trim();
  const resolvedHeaderSubtitle = (
    partnerShellHeader?.header.subtitle?.trim() ||
    headerSubtitle ||
    ''
  ).trim();

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

  const automationRow = automationStoreId ? storeOpsById[automationStoreId] : undefined;

  const sheetBody = () => {
    if (!sheet) return null;
    switch (sheet) {
      case 'notifications':
        return (
          <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-gray-500">
            <Bell size={40} className="mb-3 text-gray-300" strokeWidth={1.25} />
            <p>No notifications yet</p>
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-2">
            <Link
              href={settingsHref}
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => setSheet(null)}
            >
              Store settings
            </Link>
            <Link
              href={profileHref}
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => setSheet(null)}
            >
              Merchant profile
            </Link>
            <Link
              href={insightsHref}
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50"
              onClick={() => setSheet(null)}
            >
              Share feedback
            </Link>
          </div>
        );
      case 'status':
        return (
          <div className="space-y-2.5">
            <div className="-mx-0.5 flex border-b border-gray-200/90">
              <button
                type="button"
                className={`flex-1 border-b-2 py-2 text-xs font-semibold ${
                  statusTab === 'manage'
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setStatusTab('manage')}
              >
                Manage outlet
              </button>
              <button
                type="button"
                className={`flex-1 border-b-2 py-2 text-xs font-semibold ${
                  statusTab === 'schedule'
                    ? 'border-sky-600 text-sky-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setStatusTab('schedule')}
              >
                Schedule time-off
              </button>
            </div>

            {statusTab === 'manage' ? (
              <>
                <div className="rounded-lg border border-slate-200/90 bg-gradient-to-b from-slate-50/95 to-white p-2 shadow-sm">
                  <div className="mb-2 flex items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-white px-2 py-1.5">
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
                            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
                              isCurrent
                                ? 'border-sky-200/90 bg-sky-50/90 ring-1 ring-sky-100'
                                : 'border-slate-100 bg-white hover:border-slate-200'
                            }`}
                          >
                            <OutletBannerThumb url={s.banner_url} />
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p className="min-w-0 truncate text-xs font-semibold leading-tight text-gray-900">
                                  {s.store_name}
                                </p>
                                {isCurrent && !switchStoreMode ? (
                                  <span
                                    className="shrink-0 rounded-full bg-sky-600/15 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-sky-800"
                                    title="Currently managing this outlet"
                                  >
                                    Active
                                  </span>
                                ) : null}
                              </div>
                              <p className="truncate text-[10px] leading-tight text-gray-500">
                                {s.store_id}
                                {city ? ` · ${city}` : ''}
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
                              <div className="flex shrink-0 flex-col items-end gap-0.5">
                                <span
                                  className={`text-[9px] font-bold uppercase tracking-wide ${
                                    isOn == null ? 'text-gray-400' : isOn ? 'text-emerald-600' : 'text-rose-600'
                                  }`}
                                >
                                  {isOn == null ? '…' : isOn ? 'On' : 'Off'}
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

                <div className="rounded-lg border border-slate-200/90 bg-white p-2 shadow-sm">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Schedule automation
                  </p>
                  <p className="mb-1.5 text-[10px] text-gray-500">Applies to the outlet you select below.</p>
                  <select
                    className="mb-2 w-full rounded-md border border-slate-200 bg-slate-50/90 py-1.5 pl-2 pr-8 text-xs font-medium text-gray-800"
                    value={automationStoreId || resolvedStoreId || ''}
                    onChange={(e) => setAutomationStoreId(e.target.value)}
                  >
                    {outletsOrderedForStatus.map((s) => (
                      <option key={s.store_id} value={s.store_id}>
                        {s.store_name}
                      </option>
                    ))}
                  </select>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900">Auto-open from schedule</p>
                        <p className="text-[10px] leading-snug text-gray-500">Match saved timings</p>
                      </div>
                      <CompactSwitch
                        on={automationRow?.autoOpen !== false}
                        disabled={!automationStoreId}
                        ariaLabel="Auto-open from schedule"
                        onToggle={() =>
                          setPendingToggle({
                            kind: 'autoOpen',
                            storeId: automationStoreId || resolvedStoreId,
                            nextEnabled: !(automationRow?.autoOpen !== false),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900">Manual activation lock</p>
                        <p className="text-[10px] leading-snug text-gray-500">Stay closed until you open</p>
                      </div>
                      <CompactSwitch
                        on={automationRow?.manualLock === true}
                        disabled={!automationStoreId}
                        ariaLabel="Manual activation lock"
                        onToggle={() =>
                          setPendingToggle({
                            kind: 'manualLock',
                            storeId: automationStoreId || resolvedStoreId,
                            nextEnabled: !(automationRow?.manualLock === true),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  disabled={refreshAllBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => void handleRefreshAllOutlets()}
                >
                  {refreshAllBusy ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-600" aria-hidden />
                  ) : null}
                  {refreshAllBusy ? 'Refreshing…' : 'Refresh all'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Select a restaurant</p>
                  <div className="relative">
                    <MapPin
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                      aria-hidden
                    />
                    <select
                      className="w-full appearance-none rounded-lg border border-gray-200 py-2.5 pl-9 pr-9 text-sm text-gray-900"
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
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
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

                {schedReason !== 'Permanently shut' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-800">Start date</label>
                      <div className="relative">
                        <Calendar className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="date"
                          className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-xs"
                          value={schedStartDate}
                          onChange={(e) => setSchedStartDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-800">Start time</label>
                      <div className="relative">
                        <Clock className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="time"
                          className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-xs"
                          value={schedStartTime}
                          onChange={(e) => setSchedStartTime(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-800">End date</label>
                      <div className="relative">
                        <Calendar className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="date"
                          className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-xs"
                          value={schedEndDate}
                          onChange={(e) => setSchedEndDate(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-gray-800">End time</label>
                      <div className="relative">
                        <Clock className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                        <input
                          type="time"
                          className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-2 text-xs"
                          value={schedEndTime}
                          onChange={(e) => setSchedEndTime(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-red-700">
                    Permanent shut cannot be undone here. Confirm below when you submit.
                  </p>
                )}

                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Reason for turn-off</p>
                  <select
                    className="w-full rounded-lg border border-gray-200 py-2.5 px-3 text-sm"
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
                </div>

                <button
                  type="button"
                  disabled={schedSaving}
                  className="w-full rounded-lg bg-gray-800 py-3 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
                  onClick={() => void submitScheduleOff()}
                >
                  {schedSaving ? 'Saving…' : 'Set this schedule'}
                </button>
                <p className="text-center text-xs text-gray-500">
                  You will not receive orders during a scheduled closure window (same rules as the merchant app).
                </p>
              </>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <header className="relative flex h-[var(--mx-partner-topbar-h)] min-h-[var(--mx-partner-topbar-h)] w-full shrink-0 border-b border-[#e8e8e8] bg-white z-[60]">
        {/* Left: logo — contained so artwork cannot overlap the title column */}
        <div
          className={`flex h-full shrink-0 items-center justify-start gap-1.5 overflow-hidden border-r border-[#e8e8e8] px-2 md:px-2.5 ${leftW}`}
        >
          <MobileHamburgerButton className="shrink-0 md:hidden" />
          <Link
            href="/mx/dashboard"
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
              {resolvedHeaderSubtitle ? (
                <p className="truncate text-[11px] text-gray-500 sm:text-xs">{resolvedHeaderSubtitle}</p>
              ) : null}
            </>
          ) : (
            <span className="hidden sm:block sm:h-4" aria-hidden />
          )}
        </div>

        {/* Right actions → open sheets */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-4 px-2 sm:px-3 md:px-5">
          <button
            type="button"
            onClick={() => setSheet((s) => (s === 'notifications' ? null : 'notifications'))}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
            title="Notifications"
            aria-label="Notifications"
            aria-expanded={sheet === 'notifications'}
          >
            <Bell size={20} strokeWidth={1.75} className="text-gray-700" />
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
          <Link
            href={insightsHref}
            className="hidden text-sm text-gray-700 underline decoration-gray-400 underline-offset-2 hover:text-gray-900 lg:inline"
          >
            Share feedback
          </Link>

          <button
            type="button"
            onClick={() => setSheet((s) => (s === 'status' ? null : 'status'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 sm:gap-2 sm:px-2.5 sm:text-sm"
            aria-expanded={sheet === 'status'}
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
                {effectiveAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- session or local data URL
                  <img src={effectiveAvatarUrl} alt="" className="h-full w-full object-cover" />
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
          <div className="fixed inset-0 z-[85] flex justify-end" role="presentation">
            <div
              className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
              aria-hidden
            />
            <aside
              className="relative flex h-dvh min-h-0 w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-sheet-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className={`mx-sheet-header items-start justify-between gap-3 !px-4 !py-3 !h-auto min-h-[var(--mx-partner-topbar-h)] ${
                  sheet === 'status' ? 'sm:py-3.5' : ''
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <h2 id="partner-sheet-title" className="truncate text-sm font-semibold text-gray-900 sm:text-base">
                    {sheetTitle[sheet]}
                  </h2>
                  {sheet === 'status' && activeOutletSummary ? (
                    <p className="mt-1 line-clamp-2 text-xs leading-snug text-gray-600">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Active outlet{' '}
                      </span>
                      <span className="font-medium text-gray-800">{activeOutletSummary.name}</span>
                      <span className="text-gray-400"> · </span>
                      <span className="font-mono text-[11px] text-gray-700">{activeOutletSummary.id}</span>
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
                  aria-label="Close"
                  onClick={() => setSheet(null)}
                >
                  <X size={20} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">{sheetBody()}</div>
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
            className="fixed z-[200] max-h-[min(90vh,640px)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-2xl"
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
                    {effectiveAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={effectiveAvatarUrl} alt="" className="h-full w-full object-cover" />
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
