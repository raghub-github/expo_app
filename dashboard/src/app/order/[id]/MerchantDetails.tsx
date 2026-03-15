"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

interface Merchant {
  storeId?: number | null;
  parentId?: number | null;
  pickupLat?: number | null;
  pickupLon?: number | null;
  orderIdLabel?: string | null;
  orderPaidAtLabel?: string | null;
}

interface MerchantDetailsProps {
  merchant: Merchant;
  /** When provided, MX card shows immediately without waiting for profile-full fetch */
  initialProfile?: MerchantProfile | null;
  onCopy: (text: string) => void;
}

type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

interface OperatingDay {
  open: boolean;
  slot1Start: string | null;
  slot1End: string | null;
  slot2Start: string | null;
  slot2End: string | null;
}

interface MerchantProfile {
  parentMerchantId: string | null;
  parentName: string | null;
  storeCode: string | null;
  internalStoreId: number | null;
  storeName: string | null;
  phones: string[] | null;
  is24Hours: boolean;
  schedule: Record<DayKey, OperatingDay> | null;
  city: string | null;
  locality: string | null;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  merchantType: string | null;
  assignedUserEmail: string | null;
  assignedUserDepartment: string | null;
}

export default function MerchantDetails({ merchant, initialProfile, onCopy }: MerchantDetailsProps) {
  const storeId = merchant.storeId ?? null;
  const [profile, setProfile] = useState<MerchantProfile | null>(initialProfile ?? null);
  const [loading, setLoading] = useState(false);
  const [showTimingsModal, setShowTimingsModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) {
      setProfile(null);
      return;
    }
    if (initialProfile) {
      setProfile(initialProfile);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const extractTime = (value: unknown): string | null => {
      if (!value) return null;
      const s = String(value);
      if (s.includes("T")) {
        const [, timePart] = s.split("T");
        return timePart ? timePart.slice(0, 8) : s.slice(0, 8);
      }
      return s.slice(0, 8);
    };

    const buildDay = (oh: any, prefix: string): OperatingDay => ({
      open: Boolean(oh[`${prefix}_open`]),
      slot1Start: extractTime(oh[`${prefix}_slot1_start`]),
      slot1End: extractTime(oh[`${prefix}_slot1_end`]),
      slot2Start: extractTime(oh[`${prefix}_slot2_start`]),
      slot2End: extractTime(oh[`${prefix}_slot2_end`]),
    });

    fetch(`/api/merchant/stores/${storeId}/profile-full`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (!body?.success || !body.store) {
          setProfile(null);
          return;
        }
        const store = body.store as any;
        const oh = body.operatingHours as any | null;
        const areaManager = (body.areaManager as any) ?? null;

        const schedule: Record<DayKey, OperatingDay> | null = oh
          ? {
              monday: buildDay(oh, "monday"),
              tuesday: buildDay(oh, "tuesday"),
              wednesday: buildDay(oh, "wednesday"),
              thursday: buildDay(oh, "thursday"),
              friday: buildDay(oh, "friday"),
              saturday: buildDay(oh, "saturday"),
              sunday: buildDay(oh, "sunday"),
            }
          : null;

        setProfile({
          parentMerchantId: store.parent_merchant_id ?? null,
          parentName: store.parent_name ?? null,
          storeCode: store.store_id ?? null,
          internalStoreId: store.id ?? null,
          storeName: store.name ?? store.store_display_name ?? store.store_name ?? null,
          phones: Array.isArray(store.store_phones) ? store.store_phones : store.store_phones ? [store.store_phones] : null,
          is24Hours: Boolean(oh?.is_24_hours),
          schedule,
          city: store.city ?? null,
          locality: store.landmark ?? null,
          fullAddress: store.full_address ?? null,
          latitude: store.latitude ?? null,
          longitude: store.longitude ?? null,
          merchantType: store.store_type ?? null,
          assignedUserEmail: areaManager?.email ?? null,
          assignedUserDepartment: areaManager ? "Area Manager" : null,
        });
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [storeId, initialProfile]);

  const parentId = merchant.parentId ?? null;

  const pickupLatLon =
    merchant.pickupLat != null && merchant.pickupLon != null
      ? `${merchant.pickupLat}, ${merchant.pickupLon}`
      : null;

  const handleViewOnMap = () => {
    if (!pickupLatLon) return;
    window.open(`https://www.google.com/maps?q=${pickupLatLon}`, "_blank", "noopener");
  };

  const handleCopyGeneric = (value: string | number | null | undefined, key?: string) => {
    const text = value != null ? String(value) : "";
    if (!text) return;
    onCopy(text);
    if (key) {
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev));
      }, 1500);
    }
  };

  const todayKey = (): DayKey => {
    const d = new Date().getDay(); // 0=Sun ... 6=Sat
    return (["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as DayKey[])[d];
  };

  const getTodaySummary = () => {
    if (!profile?.schedule) {
      return { isOpen: false, label: "—" };
    }
    if (profile.is24Hours) {
      return { isOpen: true, label: "24 hours" };
    }
    const day = profile.schedule[todayKey()];
    if (!day?.open) {
      return { isOpen: false, label: "Closed today" };
    }
    const parts: string[] = [];
    if (day.slot1Start && day.slot1End) {
      parts.push(`${day.slot1Start} To ${day.slot1End}`);
    }
    if (day.slot2Start && day.slot2End) {
      parts.push(`${day.slot2Start} To ${day.slot2End}`);
    }
    return { isOpen: true, label: parts.join(" , ") || "Open today" };
  };

  const todaySummary = getTodaySummary();

  const dayOrder: { key: DayKey; label: string }[] = [
    { key: "monday", label: "Monday" },
    { key: "tuesday", label: "Tuesday" },
    { key: "wednesday", label: "Wednesday" },
    { key: "thursday", label: "Thursday" },
    { key: "friday", label: "Friday" },
    { key: "saturday", label: "Saturday" },
    { key: "sunday", label: "Sunday" },
  ];

  return (
    <>
      <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5] transition-all hover:shadow-md hover:border-gati-primary/20">
      {/* Header */}
      <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-[#e5e5e5]">
        <span className="text-[13px] font-semibold text-gati-text-primary flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 text-xs font-semibold">
              M
            </span>
            <span>Mx Details</span>
          </span>
        </span>
        <span className="text-[11px] font-medium text-rose-600 bg-rose-50 border border-rose-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
          App Not Installed
        </span>
      </div>

      {/* Body */}
      <div className="grid gap-1">
        {/* Parent Merchant Id */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">
            Parent Merchant Id:
          </div>
          <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug">
            <span className="font-mono">{profile?.parentMerchantId ?? "—"}</span>
            {profile?.parentMerchantId && (
              <button
                type="button"
                className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1"
                onClick={() => handleCopyGeneric(profile.parentMerchantId, "parentMerchantId")}
                aria-label="Copy parent merchant id"
              >
                {copiedKey === "parentMerchantId" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gati-primary" />
                )}
                <span className="sr-only">Copy</span>
              </button>
            )}
          </div>
        </div>

        {/* Parent Name */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">Parent Name:</div>
          <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug">
            <span>{profile?.parentName ?? "—"}</span>
            {profile?.parentName && (
              <button
                type="button"
                className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1"
                onClick={() => handleCopyGeneric(profile.parentName, "parentName")}
                aria-label="Copy parent name"
              >
                {copiedKey === "parentName" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gati-primary" />
                )}
                <span className="sr-only">Copy</span>
              </button>
            )}
          </div>
        </div>

        {/* Merchant Id (store code) */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">Merchant Id:</div>
          <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug">
            <span className="font-mono">{profile?.storeCode ?? "—"}</span>
            {profile?.storeCode && (
              <button
                type="button"
                className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1"
                onClick={() => handleCopyGeneric(profile.storeCode, "merchantId")}
                aria-label="Copy merchant id"
              >
                {copiedKey === "merchantId" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gati-primary" />
                )}
                <span className="sr-only">Copy</span>
              </button>
            )}
          </div>
        </div>

        {/* Store Internal Id (numeric PK) */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">
            Store Internal Id:
          </div>
          <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug">
            <span className="font-mono">{profile?.internalStoreId ?? storeId ?? "—"}</span>
            {(profile?.internalStoreId ?? storeId) != null && (
              <button
                type="button"
                className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1"
                onClick={() => handleCopyGeneric(profile?.internalStoreId ?? storeId, "storeInternalId")}
                aria-label="Copy store internal id"
              >
                {copiedKey === "storeInternalId" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gati-primary" />
                )}
                <span className="sr-only">Copy</span>
              </button>
            )}
          </div>
        </div>

        {/* Store Name (web link removed as per design) */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">Name:</div>
          <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug flex-wrap">
            <span>{profile?.storeName ?? "—"}</span>
          </div>
        </div>

        {/* MX Notifications placeholder */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">
            Mx Notifications:
          </div>
          <div className="text-[12px] text-gati-text-primary font-normal">
            <a
              href="#"
              target="_blank"
              className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-[10px] px-1 py-0.5 rounded-full bg-gati-primary-super-light border border-gati-primary-light cursor-pointer whitespace-nowrap"
            >
              <i className="bi bi-link-45deg text-[10px]" />
              link
            </a>
          </div>
        </div>

        {/* Mobile */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">Mobile:</div>
          <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug flex-wrap">
            {profile?.phones && profile.phones.length > 0 ? (
              <>
                <a
                  href={`tel:${profile.phones[0]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-gati-primary no-underline font-medium inline-flex items-center gap-0.5 text-[11px]"
                >
                  <i className="bi bi-telephone text-[12px]" />
                  {profile.phones[0]}
                </a>
                {profile.phones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowPhoneModal(true)}
                    className="inline-flex items-center gap-0.5 text-[11px] text-gati-primary cursor-pointer whitespace-nowrap"
                  >
                    <span>(Other contacts)</span>
                    <span className="text-[10px] text-slate-500">▾</span>
                  </button>
                )}
              </>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>

        {/* Timings row */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[22px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">Timings:</div>
          <div className="text-[12px] text-gati-text-primary font-normal leading-snug">
            {profile?.schedule ? (
              <button
                type="button"
                onClick={() => setShowTimingsModal(true)}
                className="inline-flex items-center gap-1.5 text-[12px] text-gati-text-primary cursor-pointer"
              >
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
                    todaySummary.isOpen
                      ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                      : "bg-red-50 text-red-700 border-red-100"
                  }`}
                >
                  {todaySummary.isOpen ? "Open" : "Closed"}
                </span>
                <span className="ml-1">{todaySummary.label}</span>
                <span className="ml-1 text-[10px] text-slate-500">▾</span>
              </button>
            ) : (
              <span>—</span>
            )}
          </div>
        </div>

        {/* More details link */}
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer whitespace-nowrap py-0.5"
            onClick={() => setShowDetailsModal(true)}
          >
            Explore More
          </button>
        </div>
      </div>
      </div>

      {/* Timings modal */}
      {showTimingsModal && profile?.schedule && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTimingsModal(false);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-lg max-w-md w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Store Timings</h2>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                onClick={() => setShowTimingsModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-[12px] text-slate-700 max-h-[60vh] overflow-y-auto">
              {dayOrder.map(({ key, label }) => {
                const day = profile.schedule![key];
                let status = "";
                let detail = "";
                let isOpen = false;

                if (profile.is24Hours) {
                  isOpen = true;
                  status = "Open";
                  detail = "24 hours";
                } else if (!day?.open) {
                  isOpen = false;
                  status = "Closed";
                  detail = "-";
                } else {
                  isOpen = true;
                  status = "Open";
                  const parts: string[] = [];
                  if (day.slot1Start && day.slot1End) {
                    parts.push(`${day.slot1Start} To ${day.slot1End}`);
                  }
                  if (day.slot2Start && day.slot2End) {
                    parts.push(`${day.slot2Start} To ${day.slot2End}`);
                  }
                  detail = parts.join(" , ") || "-";
                }

                return (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="w-24 text-[11px] font-medium text-slate-500">{label}</span>
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${
                          isOpen
                            ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                            : "bg-red-50 text-red-700 border-red-100"
                        }`}
                      >
                        {status}
                      </span>
                      <span className="text-[11px] text-slate-800">{detail}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Phone numbers modal */}
      {showPhoneModal && profile?.phones && profile.phones.length > 1 && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowPhoneModal(false);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-lg max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-900">Store Contacts</h2>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                onClick={() => setShowPhoneModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-[12px] text-slate-700 max-h-[50vh] overflow-y-auto">
              {profile.phones.map((phone, idx) => (
                <div key={`${phone}-${idx}`} className="flex items-center justify-between gap-2">
                  <span className="font-mono text-slate-800">{phone}</span>
                  <div className="flex items-center gap-2">
                    <a
                      href={`tel:${phone}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700"
                    >
                      <i className="bi bi-telephone" />
                      Call
                    </a>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100"
                      onClick={() => handleCopyGeneric(phone, `phone-${idx}`)}
                      aria-label={`Copy ${phone}`}
                    >
                      {copiedKey === `phone-${idx}` ? (
                        <Check className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <Copy className="h-3 w-3 text-slate-500" />
                      )}
                      <span className="sr-only">Copy</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Merchant details modal */}
      {showDetailsModal && profile && (
        <div
          className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDetailsModal(false);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-lg max-w-lg w-full p-5 text-[12px] text-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-900">Merchant Details</h2>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                onClick={() => setShowDetailsModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <p>
                <span className="font-medium text-slate-600">Order Id: </span>
                <span className="font-mono text-slate-900">
                  {merchant.orderIdLabel ?? "—"}
                </span>
              </p>
              <p>
                <span className="font-medium text-slate-600">Order Paid at: </span>
                <span>{merchant.orderPaidAtLabel ?? "—"}</span>
              </p>
              <p>
                <span className="font-medium text-slate-600">Merchant Id (MID): </span>
                <span className="font-mono text-slate-900">
                  {profile.storeCode ?? "—"}
                </span>
              </p>
              <p>
                <span className="font-medium text-slate-600">Store Internal Id: </span>
                <span className="font-mono text-slate-900">
                  {profile.internalStoreId ?? merchant.storeId ?? "—"}
                </span>
              </p>
              <p>
                <span className="font-medium text-slate-600">Merchant Name: </span>
                <span>{profile.storeName ?? "—"}</span>
              </p>
              <p>
                <span className="font-medium text-slate-600">Locality: </span>
                <span>{profile.locality ?? "—"}</span>
              </p>
              <p>
                <span className="font-medium text-slate-600">City: </span>
                <span className="font-medium text-slate-900">
                  {profile.city ?? "—"}
                </span>
              </p>
              <p>
                <span className="font-medium text-slate-600">Address: </span>
                <span>{profile.fullAddress ?? "—"}</span>
              </p>
              <p className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-slate-600">Lat/Lon: </span>
                <span className="font-mono text-slate-900">
                  {pickupLatLon ||
                    (profile.latitude != null && profile.longitude != null
                      ? `${profile.latitude}, ${profile.longitude}`
                      : "—")}
                </span>
                {(pickupLatLon ||
                  (profile.latitude != null && profile.longitude != null)) && (
                  <button
                    type="button"
                    onClick={handleViewOnMap}
                    className="inline-flex items-center gap-0.5 text-emerald-600 hover:text-emerald-700 text-[10px] cursor-pointer whitespace-nowrap"
                  >
                    <i className="bi bi-geo-alt text-[10px]" />
                    View on Map
                  </button>
                )}
              </p>
              <p>
                <span className="font-medium text-slate-600">MerchantType: </span>
                <span className="font-medium text-slate-900">
                  {profile.merchantType ?? "—"}
                </span>
              </p>
              <p>
                <span className="font-medium text-slate-600">AssignedUser: </span>
                <span>{profile.assignedUserEmail ?? "—"}</span>
              </p>
              <p>
                <span className="font-medium text-slate-600">AssignedUserDepartment: </span>
                <span>{profile.assignedUserDepartment ?? "—"}</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

