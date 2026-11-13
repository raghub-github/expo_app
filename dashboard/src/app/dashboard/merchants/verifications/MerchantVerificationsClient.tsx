"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Store } from "lucide-react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { MERCHANT_ADMIN_HOME_HREF } from "@/lib/merchants/portal-preference";

type VerificationStore = {
  id: number;
  store_id: string;
  store_name: string | null;
  store_display_name?: string | null;
  city: string | null;
  state?: string | null;
  approval_status: string | null;
  store_type?: string | null;
};

function storeTypeLabel(storeType: string | null | undefined): string {
  const t = (storeType ?? "").trim().toUpperCase();
  const map: Record<string, string> = {
    RESTAURANT: "Restaurant",
    CAFE: "Cafe",
    BAKERY: "Bakery",
    CLOUD_KITCHEN: "Cloud Kitchen",
    GROCERY: "Grocery",
    PHARMA: "Pharma",
  };
  return map[t] ?? (t ? t.replace(/_/g, " ") : "—");
}

function statusLabel(status: string | null): string {
  const s = (status || "").toUpperCase();
  if (s === "APPROVED") return "Verified";
  if (s === "DRAFT") return "Drafted";
  if (s === "REJECTED" || s === "BLOCKED" || s === "SUSPENDED") return "Rejected";
  return "Pending";
}

const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";
const rowBorder = "border-b-[0.5px] border-[#121212]/12";

export function MerchantVerificationsClient() {
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const portal = searchParams.get("portal");
  const urlSearch = (searchParams.get("search") || "").trim();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<VerificationStore[]>([]);

  const returnTo = useMemo(() => {
    const q = new URLSearchParams();
    q.set("portal", portal === "merchant" ? "merchant" : "admin");
    if (urlSearch) q.set("search", urlSearch);
    return `/dashboard/merchants/verifications?${q.toString()}`;
  }, [portal, urlSearch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("filter", "child");
      q.set("category", "pending");
      q.set("limit", "80");
      if (urlSearch) q.set("search", urlSearch);
      const res = await fetch(`/api/merchant/stores?${q.toString()}`, { credentials: "include" });
      const data = await res.json();
      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(
        rows.map((s: Record<string, unknown>) => ({
          id: Number(s.id),
          store_id: String(s.store_id ?? ""),
          store_name: (s.name as string) ?? (s.store_name as string) ?? null,
          store_display_name: (s.store_display_name as string) ?? null,
          city: (s.city as string) ?? null,
          state: (s.state as string) ?? null,
          approval_status: (s.approval_status as string) ?? null,
          store_type: (s.store_type as string) ?? null,
        }))
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [urlSearch]);

  useEffect(() => {
    void load();
  }, [load]);

  const openVerify = (row: VerificationStore) => {
    const v = new URLSearchParams();
    v.set("storeId", String(row.id));
    v.set("returnTo", returnTo);
    v.set("portal", portal === "merchant" ? "merchant" : "admin");
    router.push(`/dashboard/merchants/verifications?${v.toString()}`);
  };

  return (
    <div className="merchants-typo flex h-full min-h-0 flex-col overflow-hidden">
      <div className={`min-h-0 flex-1 overflow-auto bg-white ${outerBorder}`}>
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="text-xs font-medium text-[#121212]/55">
            <tr>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Store name
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Store ID
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Type
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                City
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                State
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                Status
              </th>
              <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right font-medium ${rowBorder}`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className={`px-3 py-3 ${rowBorder}`}>
                    <div className="h-4 w-2/3 animate-pulse bg-[#121212]/08" />
                  </td>
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className={`px-3 py-14 text-center ${rowBorder}`}>
                  <Store className="mx-auto h-8 w-8 text-[#121212]/25" />
                  <p className="mt-2 text-sm font-medium text-[#121212]">No pending verifications</p>
                  <button
                    type="button"
                    onClick={() => router.push(MERCHANT_ADMIN_HOME_HREF)}
                    className="mt-4 inline-flex h-8 cursor-pointer items-center border border-[#121212]/12 px-3 text-xs font-semibold text-[#121212]"
                  >
                    All Merchants
                  </button>
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const name = row.store_display_name || row.store_name || row.store_id;
                return (
                  <tr key={row.id} className="bg-rose-50 hover:bg-rose-100/70">
                    <td className={`max-w-[220px] px-3 py-2.5 font-bold text-[#121212] ${rowBorder}`}>
                      <span className="block truncate" title={name}>
                        {name}
                      </span>
                    </td>
                    <td className={`merchants-num whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      {row.store_id}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      {storeTypeLabel(row.store_type)}
                    </td>
                    <td className={`max-w-[120px] px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      <span className="block truncate" title={row.city ?? undefined}>
                        {row.city ?? "—"}
                      </span>
                    </td>
                    <td className={`max-w-[120px] px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      <span className="block truncate" title={row.state ?? undefined}>
                        {row.state?.trim() || "—"}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      {statusLabel(row.approval_status)}
                    </td>
                    <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                      <button
                        type="button"
                        onClick={() => openVerify(row)}
                        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-600"
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Verify
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
