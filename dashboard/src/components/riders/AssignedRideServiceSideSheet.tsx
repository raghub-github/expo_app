"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { DispatchServiceCode } from "@/lib/db/operations/rider-vehicle-category-service-assignments";
import type { RiderOnboardingVehicleTypeRow } from "@/lib/db/operations/rider-onboarding-vehicle-types";

type ServiceMeta = {
  label: string;
  short: string;
};

type AssignedRideServiceSideSheetProps = {
  open: boolean;
  onClose: () => void;
  categoryCode: string;
  categoryLabel: string;
  categoryHint?: string | null;
  serviceType: DispatchServiceCode;
  serviceMeta: ServiceMeta;
  vehicles: RiderOnboardingVehicleTypeRow[];
  categoryMasterOn: boolean;
  onCategoryMasterChange: (on: boolean) => void;
  isVehicleOn: (vehicleTypeCode: string) => boolean;
  onVehicleToggle: (vehicleTypeCode: string) => void;
};

export function AssignedRideServiceSideSheet({
  open,
  onClose,
  categoryCode,
  categoryLabel,
  categoryHint,
  serviceType,
  serviceMeta,
  vehicles,
  categoryMasterOn,
  onCategoryMasterChange,
  isVehicleOn,
  onVehicleToggle,
}: AssignedRideServiceSideSheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const activeCount = vehicles.filter(
    (v) => v.isActive && categoryMasterOn && isVehicleOn(v.code)
  ).length;
  const totalActive = vehicles.filter((v) => v.isActive).length;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={`${serviceMeta.label} for ${categoryLabel}`}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              {serviceMeta.short} · {categoryCode}
            </p>
            <h2 className="mt-0.5 text-lg font-bold text-gray-900">{categoryLabel}</h2>
            {categoryHint ? <p className="text-sm text-gray-500">{categoryHint}</p> : null}
            <p className="mt-2 text-sm text-gray-600">
              Enable {serviceMeta.label.toLowerCase()} for the whole category or pick specific
              vehicles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="border-b border-gray-100 px-5 py-4">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Category master</p>
              <p className="text-xs text-slate-500">
                All vehicles in {categoryLabel} — {activeCount}/{totalActive} active for dispatch
              </p>
            </div>
            <button
              type="button"
              onClick={() => onCategoryMasterChange(!categoryMasterOn)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                categoryMasterOn
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-400"
              }`}
            >
              {categoryMasterOn ? "On" : "Off"}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Vehicles in this category
          </p>
          {vehicles.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              No vehicle types in this category yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {vehicles.map((v) => {
                const vehicleOn = isVehicleOn(v.code);
                const effective = categoryMasterOn && vehicleOn && v.isActive;
                return (
                  <li
                    key={v.code}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      effective
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{v.label}</p>
                      <p className="text-xs text-gray-500 font-mono">{v.code}</p>
                      {v.mapsToVehicleType ? (
                        <p className="text-[11px] text-gray-400">
                          maps → {v.mapsToVehicleType}
                        </p>
                      ) : null}
                      {!v.isActive ? (
                        <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">
                          Inactive type
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={!categoryMasterOn || !v.isActive}
                      onClick={() => onVehicleToggle(v.code)}
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        effective
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                          : "border-slate-200 bg-white text-slate-400"
                      }`}
                      title={
                        !categoryMasterOn
                          ? "Turn on category master first"
                          : !v.isActive
                            ? "Vehicle type is inactive"
                            : undefined
                      }
                    >
                      {vehicleOn ? "On" : "Off"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Done
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Click Save assignments on the page to apply dispatch changes.
          </p>
        </footer>
      </div>
    </div>,
    document.body
  );
}
