"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface Order {
  userId?: string | number | null;
  customerLatLon?: string | null;
  customerName?: string | null;
  customerMobile?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
   dropAddressRaw?: string | null;
   dropAddressNormalized?: string | null;
   dropAddressGeocoded?: string | null;
  userType?: string | null;
  accountStatus?: string | null;
  riskFlag?: string | null;
  locationMismatch?: boolean | null;
}

interface CustomerDetailsProps {
  order: Order;
  onCopy: (text: string) => void;
  onPhoneClick: (title: string, phone: string) => void;
}

export default function CustomerDetails({
  order,
  onCopy,
  onPhoneClick,
}: CustomerDetailsProps) {
  const [copiedField, setCopiedField] = useState<"mobile" | "email" | "address" | null>(null);

  const markCopied = (field: "mobile" | "email" | "address") => {
    setCopiedField(field);
    setTimeout(() => {
      setCopiedField((prev) => (prev === field ? null : prev));
    }, 1500);
  };
  const userId = order.userId ?? "—";
  const cxDasUrl = `https://customer-dash.gatimitra.com/user-dashboard?category=Food&searchBy=User%20ID&q=${encodeURIComponent(
    String(userId)
  )}`;

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

  return (
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
        <a
          href={cxDasUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-[10px] px-1 py-0.5 rounded-full bg-gati-primary-super-light border border-gati-primary-light cursor-pointer whitespace-nowrap"
        >
          <i className="bi bi-link-45deg text-[10px]" />
          Cx-Das
        </a>
      </div>

      <div className="grid gap-1">
        {/* Name */}
        <div className="grid grid-cols-[120px_1fr] items-start min-h-[20px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">
            Name:
          </div>
          <div className="text-[12px] text-gati-text-primary font-normal break-words leading-snug">
            {order.customerName || "—"}
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
          <div className="text-[12px] text-gati-text-primary font-normal flex items-start gap-1.5 leading-snug flex-wrap">
            {cleanedPrimaryAddress}
            <button
              type="button"
              className="inline-flex items-center justify-center text-[11px] cursor-pointer opacity-80 hover:opacity-100 transition-opacity ml-1"
              onClick={() => {
                onCopy(cleanedPrimaryAddress === "—" ? "" : cleanedPrimaryAddress);
                markCopied("address");
              }}
              aria-label="Copy customer address"
            >
              {copiedField === "address" ? (
                <Check className="h-3 w-3 text-emerald-600" />
              ) : (
                <Copy className="h-3 w-3 text-gati-primary" />
              )}
              <span className="sr-only">Copy</span>
            </button>
            {order.locationMismatch && (
              <span className="inline-flex items-center rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 border border-red-100 whitespace-nowrap">
                Address mismatch &gt; 800m
              </span>
            )}
            {rawAddressCleaned && rawAddressCleaned !== cleanedPrimaryAddress && (
              <span className="w-full text-[11px] text-gati-text-secondary">
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

        {/* Wallet Link */}
        <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">
            Wallet Link:
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

        {/* User Type / Risk / Location */}
        <div className="grid grid-cols-[120px_1fr] items-start min-h-[22px]">
          <div className="text-[12px] text-gati-text-secondary font-medium">
            User Type:
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gati-text-primary">
            <span className="inline-flex items-center bg-gradient-to-br from-gati-primary to-gati-primary-light text-white px-1.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wide whitespace-nowrap">
              {order.userType || order.accountStatus || "Customer"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

