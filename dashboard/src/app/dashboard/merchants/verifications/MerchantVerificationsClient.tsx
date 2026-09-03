"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clock, Search, Store } from "lucide-react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { MerchantAdminListShell, MerchantAdminStoreRowSkeletons } from "@/components/merchants/MerchantAdminListShell";
import { MERCHANT_ADMIN_HOME_HREF } from "@/lib/merchants/portal-preference";

type VerificationStore = {
  id: number;
  store_id: string;
  store_name: string | null;
  store_display_name?: string | null;
  city: string | null;
  approval_status: string | null;
};

export function MerchantVerificationsClient() {
  const router = useRouter();
  const searchParams = useAppSearchParams();
  const portal = searchParams.get("portal");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<VerificationStore[]>([]);

  const returnTo = useMemo(() => {
    const q = new URLSearchParams();
    q.set("portal", portal === "merchant" ? "merchant" : "admin");
    return `/dashboard/merchants/verifications?${q.toString()}`;
  }, [portal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      q.set("filter", "child");
      q.set("category", "pending");
      q.set("limit", "80");
      if (appliedSearch.trim()) q.set("search", appliedSearch.trim());
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
          approval_status: (s.approval_status as string) ?? null,
        }))
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch]);

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
    <MerchantAdminListShell
      description="Pending stores waiting for document review. Open a row to verify."
      countLabel={`Queue · ${items.length}`}
      toolbar={
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(search);
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#121212]/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Store name or ID"
              className="h-8 w-44 rounded-lg border border-[#121212]/12 bg-white pl-7 pr-2 text-xs text-[#121212] outline-none focus:border-[#121212]/35 sm:w-56"
            />
          </div>
          <button
            type="submit"
            className="h-8 rounded-lg bg-[#121212] px-2.5 text-[11px] font-semibold text-white"
          >
            Search
          </button>
        </form>
      }
    >
      {loading ? (
        <MerchantAdminStoreRowSkeletons />
      ) : items.length === 0 ? (
        <div className="px-4 py-14 text-center">
          <Store className="mx-auto h-8 w-8 text-[#121212]/25" />
          <p className="mt-2 text-sm font-medium text-[#121212]">No pending verifications</p>
          <p className="mt-1 text-xs text-[#121212]/50">
            New submissions will show up here. You can still open a store from All Merchants.
          </p>
          <button
            type="button"
            onClick={() => router.push(MERCHANT_ADMIN_HOME_HREF)}
            className="mt-4 inline-flex h-8 items-center rounded-lg border border-[#121212]/12 px-3 text-xs font-semibold text-[#121212]"
          >
            All Merchants
          </button>
        </div>
      ) : (
        <div className="max-h-[min(70vh,640px)] divide-y divide-[#121212]/06 overflow-y-auto">
          {items.map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-[#F3F7FA]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#121212]">
                  {row.store_display_name || row.store_name || row.store_id}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-[#121212]/45">
                  {row.store_id}
                  {row.city ? ` · ${row.city}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  <Clock className="h-3 w-3" />
                  Pending
                </span>
                <button
                  type="button"
                  onClick={() => openVerify(row)}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-[11px] font-semibold text-white hover:bg-amber-600"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Verify
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </MerchantAdminListShell>
  );
}
