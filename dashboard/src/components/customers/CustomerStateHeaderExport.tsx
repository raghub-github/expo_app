"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import {
  ExportCustomersSheet,
  type CustomersExportSeed,
} from "@/components/customers/ExportCustomersSheet";

/** Header Export for `/dashboard/customers/all?state=…` — opens export sidesheet. */
export function CustomerStateHeaderExport() {
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const [open, setOpen] = useState(false);

  const clean = pathname.split("?")[0].split("#")[0];
  const stateParam = (searchParams.get("state") || "").trim();
  const search = (searchParams.get("search") || "").trim();
  const visible = clean === "/dashboard/customers/all" && stateParam.length > 0;
  const stateLabel = stateParam === "__unset__" ? "State not set" : stateParam;

  const seed = useMemo<CustomersExportSeed>(
    () => ({
      state: stateParam || undefined,
      search: search || undefined,
      stateLabel: stateParam ? stateLabel : undefined,
    }),
    [stateParam, search, stateLabel]
  );

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-semibold text-[#121212] shadow-sm hover:bg-[#FAFAFA]"
        aria-label="Export customers"
        title="Export customers"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        Export
      </button>
      <ExportCustomersSheet isOpen={open} onClose={() => setOpen(false)} seed={seed} />
    </>
  );
}

export function customerStateListLabel(stateParam: string): string {
  return stateParam === "__unset__" ? "State not set" : stateParam;
}

export function isCustomerStateListPath(pathname: string, stateParam: string | null): boolean {
  const clean = pathname.split("?")[0].split("#")[0];
  return clean === "/dashboard/customers/all" && Boolean((stateParam || "").trim());
}
