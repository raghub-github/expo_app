"use client";

import { useEffect, useState } from "react";
import RiderTimeline from "./RiderTimeline";
import { STANDARD_REMARKS } from "@/lib/remarks/standardRemarks";

interface RiderDetailsOrder {
  riderName?: string | null;
  riderMobile?: string | null;
  riderProvider?: string | null;
  trackingOrderId?: string | null;
  trackingUrl?: string | null;
  otp?: string | null;
  riderId?: number | null;
  status?: string | null;
  currentStatus?: string | null;
  createdAt?: string | null;
  distanceKm?: number | null;
}

interface RiderDetailsProps {
  order: RiderDetailsOrder;
  onCopy: (text: string) => void;
  onPhoneClick?: (title: string, phone: string) => void;
}

interface RiderLog {
  createdAt: string;
  provider: string;
  trackingId: string;
  name: string;
  mobile: string;
  status: string;
  updatedBy: string;
  reason: string;
  distanceCX: string;
  distanceMX: string;
  url: string;
}

// Sample rider log data for UI only.
const sampleRiderLogs: RiderLog[] = [
  {
    createdAt: "2025-12-03 04:22:15",
    provider: "SHIPROCKET_DIRECT",
    trackingId: "1061706217",
    name: "",
    mobile: "",
    status: "CANCELLED",
    updatedBy: "System",
    reason: "Rider Not Moving",
    distanceCX: "",
    distanceMX: "",
    url: "https://shiprocket.co/tracking/",
  },
  {
    createdAt: "2025-12-03 03:52:49",
    provider: "PIDGE_DIRECT",
    trackingId: "1764713267952VNLl33BZ",
    name: "",
    mobile: "",
    status: "CANCELLED",
    updatedBy: "System",
    reason: "Blacklistesd_Rider",
    distanceCX: "",
    distanceMX: "",
    url: "https://shiprocket.co/tracking/",
  },
  {
    createdAt: "2025-12-04 08:45:00",
    provider: "SHIPROCKET_DIRECT",
    trackingId: "1086718138",
    name: "Ram Yadav",
    mobile: "+917761970466",
    status: "DELIVERED",
    updatedBy: "Rider: Form App",
    reason: "",
    distanceCX: "3.57km",
    distanceMX: "1.39km",
    url: "https://shiprocket.co/tracking/",
  },
];

interface RiderLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (text: string) => void;
}

function RiderLogModal({ isOpen, onClose, onCopy }: RiderLogModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-auto text-[12px] text-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gradient-to-r from-emerald-50 to-white">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-full bg-emerald-100 text-emerald-700">
              <i className="bi bi-person-badge text-[14px]" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Rider Activity Log
              </h2>
              <p className="text-[11px] text-slate-500">
                All rider assignments and status updates for this order
              </p>
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Created at
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Provider
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Tracking ID
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Name
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Mobile
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Status
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Updated By
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    Reason
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    CX Distance
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide border-r border-gray-200">
                    MX Distance
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sampleRiderLogs.map((log, idx) => (
                  <tr
                    key={idx}
                    className={`hover:bg-gray-50 transition-colors ${
                      log.status === "CANCELLED"
                        ? "bg-red-50/40"
                        : log.status === "DELIVERED"
                          ? "bg-emerald-50/40"
                          : ""
                    }`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      <div className="font-medium">
                        {log.createdAt.split(" ")[0]}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {log.createdAt.split(" ")[1]}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.provider.includes("SHIPROCKET")
                            ? "bg-purple-100 text-purple-800"
                            : log.provider.includes("PIDGE")
                              ? "bg-blue-100 text-blue-800"
                              : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {log.provider}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] font-mono text-gray-900 border-r border-gray-100">
                      {log.trackingId}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.name || (
                        <span className="text-gray-400 italic">Not assigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      {log.mobile ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-900">{log.mobile}</span>
                          <button
                            type="button"
                            onClick={() => onCopy(log.mobile)}
                            className="p-1 hover:bg-gray-100 rounded cursor-pointer"
                            title="Copy number"
                          >
                            <i className="bi bi-clipboard text-[10px] text-gray-500" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          log.status === "DELIVERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : log.status === "CANCELLED"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.updatedBy}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] border-r border-gray-100">
                      {log.reason ? (
                        <span className="text-red-600 font-medium">
                          {log.reason}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.distanceCX || (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 border-r border-gray-100">
                      {log.distanceMX || (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                      {log.url ? (
                        <a
                          href={log.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium rounded-md transition-colors"
                        >
                          <i className="bi bi-box-arrow-up-right" />
                          Track
                        </a>
                      ) : (
                        <span className="text-gray-400 italic">No URL</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-600">Total Logs</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {sampleRiderLogs.length}
                  </p>
                </div>
                <div className="p-2 bg-gray-100 rounded-lg">
                  <i className="bi bi-list-ol text-gray-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-red-50 rounded-lg p-3 border border-red-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-red-600">Cancelled</p>
                  <p className="text-xl font-bold text-red-900 mt-1">
                    {
                      sampleRiderLogs.filter(
                        (log) => log.status === "CANCELLED"
                      ).length
                    }
                  </p>
                </div>
                <div className="p-2 bg-red-100 rounded-lg">
                  <i className="bi bi-x-circle text-red-600 text-base" />
                </div>
              </div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-emerald-600">Delivered</p>
                  <p className="text-xl font-bold text-emerald-900 mt-1">
                    {
                      sampleRiderLogs.filter(
                        (log) => log.status === "DELIVERED"
                      ).length
                    }
                  </p>
                </div>
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <i className="bi bi-check-circle text-emerald-600 text-base" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-gray-50 text-[11px] text-gray-500">
          <div>
            <i className="bi bi-info-circle mr-1" />
            Showing {sampleRiderLogs.length} rider activity records
          </div>
          <button
            type="button"
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-md text-[11px] font-medium cursor-pointer"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

type CancelActionOption = "" | "CANCEL" | "CANCEL_ASSIGN";

export default function RiderDetails({ order, onCopy, onPhoneClick }: RiderDetailsProps) {
  const [showLogModal, setShowLogModal] = useState(false);
  const [riderAttribute, setRiderAttribute] = useState("");
  const [rejectionOptions, setRejectionOptions] = useState<string[]>([]);
  const [rejectionOption, setRejectionOption] = useState("");
  const [cancelAction, setCancelAction] = useState<CancelActionOption>("");

  const handleAttributeChange = (value: string) => {
    setRiderAttribute(value);
    const key = value as keyof typeof STANDARD_REMARKS;
    setRejectionOptions(STANDARD_REMARKS[key] || []);
    setRejectionOption("");
    setCancelAction("");
  };

  const handleRejectionOptionChange = (value: string) => {
    setRejectionOption(value);
    setCancelAction("");
  };

  const isSecondDropdownEnabled = !!riderAttribute;
  const isThirdDropdownEnabled = isSecondDropdownEnabled && !!rejectionOption;
  const isButtonEnabled = isThirdDropdownEnabled && !!cancelAction;

  const riderName = order.riderName || "—";
  const riderMobile = order.riderMobile || "—";
  const rawProvider = order.riderProvider || "—";
  const riderProvider =
    !rawProvider || rawProvider === "internal" ? "GatiMitra" : rawProvider;
  const trackingOrderId = order.trackingOrderId || "—";
  const trackingUrl = order.trackingUrl || "";
  const otp = order.otp || "—";

  const statusString = (order.currentStatus || order.status || "").toString().toLowerCase();
  const statusRank: Record<string, number> = {
    assigned: 0,
    accepted: 0,
    reached_store: 1,
    picked_up: 2,
    in_transit: 2,
    delivered: 3,
    cancelled: 3,
    failed: 3,
  };
  const currentStageIndex =
    statusRank[statusString] !== undefined ? statusRank[statusString] : 0;

  const createdDate = order.createdAt ? new Date(order.createdAt) : null;

  const formatTimeShort = (date: Date | null) => {
    if (!date || isNaN(date.getTime())) return "—";
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  return (
    <>
      <div className="bg-white rounded-lg px-3 py-2 shadow-sm border border-[#e5e5e5] transition-all hover:shadow-md hover:border-gati-primary/20">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-1.5 mb-2 border-b border-[#e5e5e5] gap-2">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-gati-text-primary">
            <div className="h-7 w-7 rounded-full overflow-hidden bg-sky-100 flex items-center justify-center">
              <span className="text-sky-700 text-xs font-semibold">
                {riderName !== "—" ? riderName.charAt(0).toUpperCase() : "R"}
              </span>
            </div>
            <span>Rider details</span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 rounded-full transition-colors cursor-pointer"
            onClick={() => setShowLogModal(true)}
          >
            <i className="bi bi-eye" />
            View Rider&apos;s Log
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 min-w-[200px] space-y-1 text-[11px]">
            <div className="flex justify-between gap-3">
              <span className="text-gati-text-secondary">Rider provider:</span>
              <span className="text-gati-text-primary font-medium">
                {riderProvider}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gati-text-secondary">Rider name:</span>
              <span className="text-gati-text-primary font-medium">
                {riderName}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gati-text-secondary">Mobile number:</span>
              <div className="flex items-center gap-1.5 text-gati-primary font-medium">
                {riderMobile}
                {order.riderMobile && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center text-[10px] cursor-pointer opacity-80 hover:opacity-100"
                    onClick={() => {
                      onCopy(order.riderMobile || "");
                      onPhoneClick?.("Rider Phone", order.riderMobile || "");
                    }}
                    aria-label="Copy rider mobile"
                  >
                    <i className="bi bi-clipboard" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gati-text-secondary">Tracking Order Id:</span>
              <div className="flex items-center gap-1.5 text-gati-text-primary font-medium">
                <span>{trackingOrderId}</span>
                {order.trackingOrderId && (
                  <button
                    type="button"
                    className="inline-flex items-center justify-center text-[10px] cursor-pointer opacity-80 hover:opacity-100"
                    onClick={() => onCopy(order.trackingOrderId || "")}
                    aria-label="Copy tracking order id"
                  >
                    <i className="bi bi-clipboard" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-gati-text-secondary">Tracking URL:</span>
              {trackingUrl ? (
                <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-emerald-600 text-[11px] font-semibold"
                >
                  <i className="bi bi-box-arrow-up-right" />
                  View
                </a>
              ) : (
                <span className="text-gati-text-primary text-[11px]">—</span>
              )}
            </div>
            <div className="flex justify-between items-center gap-3">
              <span className="text-gati-text-secondary">OTP:</span>
              <div className="px-2.5 py-0.5 border border-dashed border-emerald-400 bg-emerald-50 rounded text-emerald-700 font-mono text-[11px] font-semibold tracking-[0.15em]">
                {otp}
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <RiderTimeline
              createdAt={order.createdAt}
              pickedUpAt={null}
              deliveredAt={null}
              status={order.currentStatus || order.status || null}
              distanceKm={order.distanceKm ?? null}
            />
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 mt-3 relative z-0">
          <div className="text-[11px] font-semibold mb-1.5 flex items-center gap-1.5">
            <i className="bi bi-slash-circle" />
            Rider cancellation
          </div>
          <div className="flex flex-col md:flex-row gap-2 text-[10px] relative">
            <div className="relative flex-1 focus-within:z-20">
              <select
                className="relative z-10 flex-1 h-8 w-full border border-slate-300 rounded px-2 bg-white cursor-pointer"
                value={riderAttribute}
                onChange={(e) => handleAttributeChange(e.target.value)}
              >
                <option value="">Select Attribute</option>
                <option value="CUSTOMER">CUSTOMER</option>
                <option value="RIDER">RIDER</option>
                <option value="MERCHANT">MERCHANT</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>
            <div className="relative flex-1 focus-within:z-20">
              <select
                className={`relative z-10 flex-1 h-8 w-full border border-slate-300 rounded px-2 bg-white ${
                  isSecondDropdownEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                }`}
                value={rejectionOption}
                onChange={(e) => handleRejectionOptionChange(e.target.value)}
                disabled={!isSecondDropdownEnabled}
              >
                <option value="">Select Rejection Option</option>
                {rejectionOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
            <div className="relative flex-1 focus-within:z-20">
              <select
                className={`relative z-10 flex-1 h-8 w-full border border-slate-300 rounded px-2 bg-white ${
                  isThirdDropdownEnabled ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                }`}
                value={cancelAction}
                onChange={(e) =>
                  setCancelAction(e.target.value as CancelActionOption)
                }
                disabled={!isThirdDropdownEnabled}
              >
                <option value="">Select Option</option>
                <option value="CANCEL">CANCEL</option>
                <option value="CANCEL_ASSIGN">CANCEL &amp; ASSIGN</option>
              </select>
            </div>
            <button
              type="button"
              disabled={!isButtonEnabled}
              className={`h-8 px-3 rounded text-[11px] font-semibold inline-flex items-center gap-1 mt-1 md:mt-0 ${
                isButtonEnabled
                  ? cancelAction === "CANCEL_ASSIGN"
                    ? "bg-slate-700 hover:bg-slate-800 text-white cursor-pointer"
                    : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed"
              }`}
              onClick={() => {
                if (!isButtonEnabled) return;
                // Placeholder action; cancel flow can be wired later.
                // eslint-disable-next-line no-alert
                alert("Rider cancellation flow will be implemented soon.");
              }}
            >
              {cancelAction === "CANCEL_ASSIGN" ? (
                <>
                  <i className="bi bi-arrow-repeat" />
                  Cancel &amp; Assign
                </>
              ) : (
                <>
                  <i className="bi bi-x-circle" />
                  Cancel
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <RiderLogModal
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        onCopy={onCopy}
      />
    </>
  );
}

