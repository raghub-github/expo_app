"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Store, Loader2 } from "lucide-react";

type ChildRow = {
  type: "child";
  id: number;
  store_id: string;
  parent_id: number | null;
  name: string;
  city: string | null;
  approval_status: string;
};

type ParentRow = {
  type: "parent";
  id: number;
  merchant_id: string;
  name: string;
  phone: string | null;
  city: string | null;
  approval_status: string;
  children: ChildRow[];
};

export function OrderOverviewClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = (searchParams.get("search") || "").trim();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentResult, setParentResult] = useState<ParentRow | null>(null);

  useEffect(() => {
    if (!query) {
      setParentResult(null);
      setError(null);
      return;
    }
    setError(null);
    setParentResult(null);
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const childRes = await fetch(
          `/api/merchant/stores?filter=child&search=${encodeURIComponent(query)}&limit=10`
        );
        const childData = await childRes.json();
        if (cancelled) return;
        if (!childRes.ok || !childData.success) {
          setError("Search failed. Please try again.");
          setLoading(false);
          return;
        }
        const childItems = childData.items || [];
        if (childItems.length === 1) {
          setLoading(false);
          setParentResult({
            type: "parent",
            id: 0,
            merchant_id: "",
            name: childItems[0].name,
            phone: null,
            city: childItems[0].city,
            approval_status: childItems[0].approval_status,
            children: [childItems[0]],
          });
          return;
        }
        const parentRes = await fetch(
          `/api/merchant/stores?filter=parent&search=${encodeURIComponent(query)}&limit=5`
        );
        const parentData = await parentRes.json();
        if (cancelled) return;
        setLoading(false);
        if (!parentRes.ok || !parentData.success) {
          setError("Search failed. Please try again.");
          return;
        }
        const parentItems = parentData.items || [];
        if (parentItems.length === 1 && parentItems[0].children?.length) {
          setParentResult(parentItems[0]);
        } else if (parentItems.length === 1 && (!parentItems[0].children || parentItems[0].children.length === 0)) {
          setError("No stores found under this parent.");
        } else if (parentItems.length > 1) {
          setParentResult(parentItems[0]);
        } else {
          setError("No parent or child store found for this search.");
        }
      } catch {
        if (!cancelled) {
          setLoading(false);
          setError("Search failed. Please try again.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [query, router]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-gray-900 mb-4">Order Overview</h1>
      {!query ? null : (
        <>
      {error && (
        <p className="text-sm text-red-600 mb-4" role="alert">
          {error}
        </p>
      )}
      {parentResult && !loading && (
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Parent: {parentResult.name}
            {parentResult.merchant_id ? ` (${parentResult.merchant_id})` : ""}
          </p>
          <p className="text-xs text-gray-500 mb-3">Stores under this parent:</p>
          <ul className="space-y-2">
            {parentResult.children.map((child) => (
              <li
                key={child.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                    <Store className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{child.name}</p>
                    <p className="text-xs text-gray-500">
                      {child.store_id}
                      {child.city ? ` · ${child.city}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/merchants/stores/${child.id}`)}
                  className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <Store className="h-3.5 w-3.5" />
                  Dashboard
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
        </>
      )}
    </div>
  );
}
