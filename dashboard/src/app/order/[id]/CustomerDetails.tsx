"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Copy, X } from "lucide-react";
import {
  TRUST_TIER_LABEL,
  trustTierUserTypeClass,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";
import { CustomerFraudReasonModal } from "@/components/customers/CustomerFraudReasonModal";
import {
  collectCustomerLinkedContactPhones,
  formatLinkedContactPhone,
  shouldShowCustomerContactsDropdown,
} from "@/lib/orders/customer-linked-contacts";

function buildCustomerDashboardUrl(
  customerDbId: number | null | undefined,
  customerExternalId: string | number | null | undefined
): string | null {
  const externalId =
    customerExternalId != null && String(customerExternalId).trim() !== ""
      ? String(customerExternalId).trim()
      : "";
  if (!customerDbId && !externalId) return null;

  const envBase =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_CONTROL_APP_URL?.trim()
      ? process.env.NEXT_PUBLIC_CONTROL_APP_URL.trim().replace(/\/$/, "")
      : "";
  const base =
    envBase ||
    (typeof window !== "undefined" ? window.location.origin : "https://control.gatimitra.com");

  const searchQ = externalId ? encodeURIComponent(externalId) : "";
  const fromOrderQs = "fromOrder=1";
  if (customerDbId) {
    const query = searchQ ? `search=${searchQ}&${fromOrderQs}` : fromOrderQs;
    return `${base}/dashboard/customers/${customerDbId}?${query}`;
  }
  const query = searchQ ? `search=${searchQ}&${fromOrderQs}` : fromOrderQs;
  return `${base}/dashboard/customers/all?${query}`;
}

interface Order {
  userId?: string | number | null;
  /** Internal customers.id — used to load GatiCash wallet balance. */
  customerDbId?: number | null;
  customerLatLon?: string | null;
  customerName?: string | null;
  customerMobile?: string | null;
  customerAlternateMobile?: string | null;
  orderAlternateContactPhone?: string | null;
  orderDeliveryPrimaryContactPhone?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  dropAddressRaw?: string | null;
  dropAddressNormalized?: string | null;
  dropAddressGeocoded?: string | null;
  userType?: string | null;
  fraudReasons?: string[] | null;
  accountStatus?: string | null;
  riskFlag?: string | null;
  locationMismatch?: boolean | null;
}

interface CustomerDetailsProps {
  order: Order;
  onCopy: (text: string) => void;
  onPhoneClick: (title: string, phone: string) => void;
  onOpenPartnerChat?: () => void;
}

function userTypeTierClass(label: string | null | undefined): string {
  const trimmed = label?.trim();
  if (!trimmed || trimmed === "—") return "text-slate-600";
  const tier = (Object.entries(TRUST_TIER_LABEL).find(([, v]) => v === trimmed)?.[0] ??
    null) as CustomerTrustTier | null;
  if (tier && tier in TRUST_TIER_LABEL) return trustTierUserTypeClass(tier);
  return "font-semibold text-slate-800";
}

function CustomerLinkedContactsModal({
  phones,
  onCopy,
  onClose,
}: {
  phones: string[];
  onCopy: (text: string) => void;
  onClose: () => void;
}) {
  const [copiedPhone, setCopiedPhone] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopyPhone = (phone: string) => {
    const display = formatLinkedContactPhone(phone);
    onCopy(display);
    setCopiedPhone(phone);
    setTimeout(() => {
      setCopiedPhone((prev) => (prev === phone ? null : prev));
    }, 1500);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Customer Others contact"
    >
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Customer Others contact</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="list-disc space-y-2 px-8 py-4 text-[13px] text-slate-800">
          {phones.map((phone) => (
            <li key={phone} className="flex items-center gap-1.5">
              <span>{formatLinkedContactPhone(phone)}</span>
              <button
                type="button"
                className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                onClick={() => handleCopyPhone(phone)}
                aria-label={`Copy ${formatLinkedContactPhone(phone)}`}
              >
                {copiedPhone === phone ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gati-primary" />
                )}
                <span className="sr-only">Copy</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

export default function CustomerDetails({
  order,
  onCopy,
  onPhoneClick,
  onOpenPartnerChat,
}: CustomerDetailsProps) {
  const [copiedField, setCopiedField] = useState<"mobile" | "email" | "address" | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [fraudModalOpen, setFraudModalOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null | undefined>(undefined);

  const isFraudUserType = useMemo(() => {
    const label = order.userType?.trim();
    if (!label) return false;
    return label.toLowerCase() === "fraud";
  }, [order.userType]);

  useEffect(() => {
    const id = order.customerDbId;
    if (!id) {
      setWalletBalance(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/customers/${id}`, { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setWalletBalance(null);
          return;
        }
        const json = (await res.json()) as {
          success?: boolean;
          data?: {
            walletBalance?: number | string | null;
            wallet?: {
              availableBalance?: number;
              currentBalance?: number;
            } | null;
          };
        };
        if (!cancelled && json.success && json.data) {
          const w = json.data.wallet;
          const raw =
            w?.availableBalance ??
            w?.currentBalance ??
            json.data.walletBalance;
          setWalletBalance(raw == null ? null : Number(raw));
        } else if (!cancelled) {
          setWalletBalance(null);
        }
      } catch {
        if (!cancelled) setWalletBalance(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [order.customerDbId]);

  const linkedPhones = useMemo(
    () =>
      collectCustomerLinkedContactPhones({
        primaryMobile: order.customerMobile,
        customerAlternateMobile: order.customerAlternateMobile,
        orderAlternateContactPhone: order.orderAlternateContactPhone,
        orderDeliveryPrimaryContactPhone: order.orderDeliveryPrimaryContactPhone,
      }),
    [
      order.customerMobile,
      order.customerAlternateMobile,
      order.orderAlternateContactPhone,
      order.orderDeliveryPrimaryContactPhone,
    ]
  );

  const showContacts = shouldShowCustomerContactsDropdown({
    primaryMobile: order.customerMobile,
    customerAlternateMobile: order.customerAlternateMobile,
    orderAlternateContactPhone: order.orderAlternateContactPhone,
    orderDeliveryPrimaryContactPhone: order.orderDeliveryPrimaryContactPhone,
  });

  const markCopied = (field: "mobile" | "email" | "address") => {
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((prev) => (prev === field ? null : prev));
    }, 1500);
  };
  const userId = order.userId ?? "—";
  const cxDasUrl = useMemo(
    () => buildCustomerDashboardUrl(order.customerDbId, order.userId),
    [order.customerDbId, order.userId]
  );

  const handleViewOnMap = () => {
    const latLon = order.customerLatLon;
    if (!latLon) return;
    window.open(`https://www.google.com/maps?q=${latLon}`, "_blank", "noopener");
  };

  const primaryAddressSource =
    order.dropAddressNormalized || order.customerAddress || order.dropAddressRaw || "";
  const cleanedPrimaryAddress =
    primaryAddressSource
      ?.replace(/\s*,\s*,/g, ", ")
      .replace(/(,\s*)+$/, "") || "—";

  const rawAddressCleaned =
    order.dropAddressRaw
      ?.toString()
      .replace(/\s*,\s*,/g, ", ")
      .replace(/(,\s*)+$/, "") || null;

  const formatWalletBalance = (amount: number | null | undefined) => {
    if (amount === undefined) return "…";
    if (amount === null || Number.isNaN(amount)) return "—";
    return `₹${Number(amount).toFixed(2)}`;
  };

  return (
    <>
      <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5] transition-all hover:shadow-md hover:border-gati-primary/20">
        <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-[#e5e5e5]">
          <span className="text-[13px] font-semibold text-gati-text-primary flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                C
              </span>
              <span>
                <span>CX Details </span>
                <span className="font-normal">#{userId}</span>
              </span>
            </span>
            {order.riskFlag && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-100 whitespace-nowrap">
                Risk: {order.riskFlag}
              </span>
            )}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {cxDasUrl ? (
              <a
                href={cxDasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-[10px] px-1 py-0.5 rounded-full bg-gati-primary-super-light border border-gati-primary-light cursor-pointer whitespace-nowrap"
              >
                <i className="bi bi-link-45deg text-[10px]" />
                Cx-Das
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid gap-1">
          {/* Name */}
          <div className="grid grid-cols-[120px_1fr] items-start min-h-[20px]">
            <div className="text-[12px] text-gati-text-secondary font-medium">
              Name:
            </div>
            <div className="text-[12px] text-gati-text-primary font-normal break-words leading-snug flex items-center justify-between gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span>{order.customerName || "—"}</span>
                {order.userType?.trim() ? (
                  isFraudUserType ? (
                    <button
                      type="button"
                      onClick={() => setFraudModalOpen(true)}
                      className={`inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ring-1 ring-slate-200 cursor-pointer hover:bg-red-50 hover:ring-red-200 ${userTypeTierClass(order.userType)}`}
                      title="View fraud reason"
                    >
                      {order.userType.trim()}
                    </button>
                  ) : (
                    <span
                      className={`inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide whitespace-nowrap ring-1 ring-slate-200 ${userTypeTierClass(order.userType)}`}
                    >
                      {order.userType.trim()}
                    </span>
                  )
                ) : null}
              </div>
              {showContacts ? (
                <button
                  type="button"
                  onClick={() => setContactsOpen(true)}
                  className="inline-flex shrink-0 items-center gap-0 text-gati-primary font-medium text-[10px] p-0 border-0 bg-transparent cursor-pointer whitespace-nowrap hover:opacity-80 ml-auto"
                >
                  Contacts
                  <ChevronDown className="h-2.5 w-2.5" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          </div>

          {/* Mobile */}
          <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
            <div className="text-[12px] text-gati-text-secondary font-medium">
              Mobile:
            </div>
            <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug">
              <a
                href={order.customerMobile ? `tel:${order.customerMobile}` : "#"}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  onPhoneClick("Customer Phone", order.customerMobile || "");
                }}
                className="text-gati-primary no-underline font-medium inline-flex items-center gap-0.5 text-[12px]"
              >
                <i className="bi bi-telephone" />
                {order.customerMobile || "—"}
              </a>
              <button
                type="button"
                className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1"
                onClick={() => {
                  onCopy(order.customerMobile || "");
                  markCopied("mobile");
                }}
                aria-label="Copy customer mobile"
              >
                {copiedField === "mobile" ? (
                  <Check className="h-3 w-3 text-emerald-600" />
                ) : (
                  <Copy className="h-3 w-3 text-gati-primary" />
                )}
                <span className="sr-only">Copy</span>
              </button>
            </div>
          </div>

          {/* Email */}
          <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
            <div className="text-[12px] text-gati-text-secondary font-medium">
              Email:
            </div>
            <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-1.5 leading-snug">
              <span>{order.customerEmail || "—"}</span>
              {order.customerEmail && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1"
                  onClick={() => {
                    onCopy(order.customerEmail || "");
                    markCopied("email");
                  }}
                  aria-label="Copy customer email"
                >
                  {copiedField === "email" ? (
                    <Check className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <Copy className="h-3 w-3 text-gati-primary" />
                  )}
                  <span className="sr-only">Copy</span>
                </button>
              )}
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
            <div className="text-[12px] text-gati-text-secondary font-medium">
              Address:
            </div>
            <div className="min-w-0 text-[12px] text-gati-text-primary font-normal leading-snug break-words">
              {cleanedPrimaryAddress}
              {cleanedPrimaryAddress !== "—" ? (
                <>
                  {"\u00A0"}
                  <button
                    type="button"
                    className="inline align-middle text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity p-0 border-0 bg-transparent leading-none"
                    onClick={() => {
                      onCopy(cleanedPrimaryAddress);
                      markCopied("address");
                    }}
                    aria-label="Copy customer address"
                  >
                    {copiedField === "address" ? (
                      <Check className="inline h-3 w-3 text-emerald-600 align-middle" />
                    ) : (
                      <Copy className="inline h-3 w-3 text-gati-primary align-middle" />
                    )}
                    <span className="sr-only">Copy</span>
                  </button>
                </>
              ) : null}
              {order.locationMismatch && (
                <span className="mt-1 inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 border border-red-100 whitespace-nowrap">
                  Address mismatch &gt; 800m
                </span>
              )}
              {rawAddressCleaned && rawAddressCleaned !== cleanedPrimaryAddress && (
                <span className="mt-1 block text-[11px] text-gati-text-secondary">
                  Raw: {rawAddressCleaned}
                </span>
              )}
            </div>
          </div>

          {/* Lat/Lon and View on Map */}
          <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
            <div className="text-[12px] text-gati-text-secondary font-medium">
              Lat/Lon:
            </div>
            <div className="text-[12px] text-gati-text-primary font-normal flex items-center gap-2 flex-wrap leading-snug">
              <span className="text-xs text-gati-text-light font-semibold">
                {order.customerLatLon || "—"}
              </span>
              {order.customerLatLon && (
                <button
                  type="button"
                  onClick={handleViewOnMap}
                  className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-[10px] px-1 py-0.5 rounded-full bg-gati-primary-super-light border border-gati-primary-light cursor-pointer whitespace-nowrap"
                >
                  <i className="bi bi-geo-alt text-[10px]" />
                  View on Map
                </button>
              )}
            </div>
          </div>

          {/* Cx Notifications */}
          <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
            <div className="text-[12px] text-gati-text-secondary font-medium">
              Cx Notifications:
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

          {/* Wallet balance + Chat History */}
          <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
            <div className="text-[12px] text-gati-text-secondary font-medium">
              Wallet balance:
            </div>
            <div className="text-[12px] text-gati-text-primary font-normal flex items-center justify-between gap-4 min-w-0">
              <span className="shrink-0 font-semibold tabular-nums text-emerald-700">
                {formatWalletBalance(walletBalance)}
              </span>
              {onOpenPartnerChat ? (
                <button
                  type="button"
                  onClick={onOpenPartnerChat}
                  className="inline-flex shrink-0 items-center gap-0.5 text-gati-primary font-medium text-[10px] p-0 border-0 bg-transparent cursor-pointer whitespace-nowrap ml-auto hover:opacity-80"
                >
                  <i className="bi bi-chat-left-text text-[10px]" />
                  Chat history
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {contactsOpen ? (
        <CustomerLinkedContactsModal
          phones={linkedPhones}
          onCopy={onCopy}
          onClose={() => setContactsOpen(false)}
        />
      ) : null}

      {fraudModalOpen ? (
        <CustomerFraudReasonModal
          customerLabel={order.customerName ?? undefined}
          reasons={order.fraudReasons ?? []}
          onClose={() => setFraudModalOpen(false)}
        />
      ) : null}
    </>
  );
}
