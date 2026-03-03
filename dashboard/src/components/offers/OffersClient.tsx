"use client";

import { useState, useMemo } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCw,
  Tag,
  Store,
  Gift,
  IndianRupee,
} from "lucide-react";
import { useToast } from "@/context/ToastContext";
import {
  useMerchantPlansQuery,
  useToggleMerchantPlanStatus,
  useDeleteMerchantPlan,
  type MerchantPlan,
} from "@/hooks/queries/useMerchantPlansQuery";
import { MerchantPlanForm } from "./MerchantPlanForm";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type OfferTab = "merchant" | "rider" | "customer";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MerchantPlansTable({
  plans,
  onEdit,
  onDelete,
  onToggleStatus,
  isTogglingId,
}: {
  plans: MerchantPlan[];
  onEdit: (p: MerchantPlan) => void;
  onDelete: (p: MerchantPlan) => void;
  onToggleStatus: (p: MerchantPlan) => void;
  isTogglingId: number | null;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200/80 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50/80">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Plan</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Code</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Price</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Billing</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Limits</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {plans.map((p) => (
            <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-blue-100">
                    <Tag className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{p.planName}</p>
                    {p.description && <p className="text-xs text-gray-500 truncate max-w-[200px]">{p.description}</p>}
                  </div>
                  {p.isPopular && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Popular</span>
                  )}
                </div>
              </td>
              <td className="px-4 py-3">
                <code className="text-sm font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-800">{p.planCode}</code>
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">₹{p.price}</td>
              <td className="px-4 py-3 text-sm text-gray-600">{p.billingCycle}</td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {[p.maxMenuItems, p.maxCuisines, p.maxMenuCategories].some((x) => x != null)
                  ? `${p.maxMenuItems ?? "—"} / ${p.maxCuisines ?? "—"} / ${p.maxMenuCategories ?? "—"}`
                  : "—"}
              </td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onToggleStatus(p)}
                  disabled={isTogglingId === p.id}
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                    p.isActive ? "bg-green-100 text-green-800 hover:bg-green-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {isTogglingId === p.id ? "…" : p.isActive ? "Active" : "Inactive"}
                </button>
              </td>
              <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(p.createdAt)}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => onEdit(p)} className="p-2 rounded-lg text-gray-500 hover:bg-blue-50 hover:text-blue-600" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onDelete(p)} className="p-2 rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MerchantPlanCards({
  plans,
  onEdit,
  onDelete,
  onToggleStatus,
  isTogglingId,
}: {
  plans: MerchantPlan[];
  onEdit: (p: MerchantPlan) => void;
  onDelete: (p: MerchantPlan) => void;
  onToggleStatus: (p: MerchantPlan) => void;
  isTogglingId: number | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((p) => (
        <div key={p.id} className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1.5 rounded-lg bg-blue-100 shrink-0">
                <Tag className="h-4 w-4 text-blue-600" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate">{p.planName}</p>
                <code className="text-xs text-gray-500">{p.planCode}</code>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleStatus(p)}
              disabled={isTogglingId === p.id}
              className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${p.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}
            >
              {isTogglingId === p.id ? "…" : p.isActive ? "Active" : "Inactive"}
            </button>
          </div>
          <div className="space-y-1.5 text-sm text-gray-600 mb-4">
            <p className="flex items-center gap-2 font-medium text-gray-900">
              <IndianRupee className="h-3.5 w-3.5" />
              {p.price} / {p.billingCycle}
            </p>
            {(p.maxMenuItems != null || p.maxCuisines != null || p.maxMenuCategories != null) && (
              <p className="text-xs">
                Limits: Menu {p.maxMenuItems ?? "—"} • Cuisines {p.maxCuisines ?? "—"} • Categories {p.maxMenuCategories ?? "—"}
              </p>
            )}
            {p.description && <p className="text-xs text-gray-500 line-clamp-2">{p.description}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => onEdit(p)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button type="button" onClick={() => onDelete(p)} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function OffersClient() {
  const { toast } = useToast();
  const [tab, setTab] = useState<OfferTab>("merchant");
  const [search, setSearch] = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "">("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<MerchantPlan | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<MerchantPlan | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const limit = 20;
  const filters = useMemo(
    () => ({ search: searchApplied, status: statusFilter, limit, offset: (page - 1) * limit }),
    [searchApplied, statusFilter, page, limit]
  );

  const { data, isLoading, error, refetch, isFetching } = useMerchantPlansQuery(filters);
  const toggleStatus = useToggleMerchantPlanStatus();
  const deletePlan = useDeleteMerchantPlan();

  const plans = data?.plans ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const applySearch = () => setSearchApplied(search.trim());
  const clearSearch = () => {
    setSearch("");
    setSearchApplied("");
    setPage(1);
  };

  const handleEdit = (p: MerchantPlan) => {
    setEditPlan(p);
    setFormOpen(true);
  };

  const handleAdd = () => {
    setEditPlan(null);
    setFormOpen(true);
  };

  const handleFormSuccess = () => toast("Plan saved successfully");

  const handleToggleStatus = async (p: MerchantPlan) => {
    setTogglingId(p.id);
    try {
      await toggleStatus.mutateAsync({ id: p.id, isActive: !p.isActive });
      toast(p.isActive ? "Plan deactivated" : "Plan activated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (p: MerchantPlan) => {
    try {
      await deletePlan.mutateAsync(p.id);
      toast("Plan deleted successfully");
      setDeleteConfirm(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete plan");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Offers</h1>
          <p className="mt-1 text-sm text-gray-600">Manage offers and plans for merchants, riders, and customers</p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Offer type" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
            {(
              [
                { key: "merchant", label: "Merchant", icon: Store },
                { key: "rider", label: "Rider", icon: Gift },
                { key: "customer", label: "Customer", icon: Tag },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === key ? "bg-blue-600 text-white shadow-sm" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "merchant" && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by plan name or code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applySearch()}
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button type="button" onClick={applySearch} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                Search
              </button>
              {searchApplied && (
                <button type="button" onClick={clearSearch} className="text-sm text-gray-500 hover:text-gray-700">
                  Clear
                </button>
              )}
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as "active" | "inactive" | "");
                  setPage(1);
                }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <button type="button" onClick={handleAdd} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm">
              <Plus className="h-4 w-4" />
              Add New Plan
            </button>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center min-h-[320px] gap-4 rounded-xl border border-gray-200 bg-gray-50/50">
              <LoadingSpinner />
              <p className="text-sm text-gray-500">Loading plans…</p>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-red-700 font-medium">Failed to load plans</p>
              <p className="text-sm text-red-600 mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
              <button type="button" onClick={() => refetch()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700">
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-16 text-center">
              <Gift className="h-14 w-14 text-gray-300 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-700">No plans yet</p>
              <p className="text-sm text-gray-500 mt-1">
                {searchApplied || statusFilter ? "Try adjusting your search or filters" : "Create your first merchant plan to get started"}
              </p>
              {!searchApplied && !statusFilter && (
                <button type="button" onClick={handleAdd} className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                  <Plus className="h-4 w-4" /> Add New Plan
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <MerchantPlansTable plans={plans} onEdit={handleEdit} onDelete={(p) => setDeleteConfirm(p)} onToggleStatus={handleToggleStatus} isTogglingId={togglingId} />
              </div>
              <div className="md:hidden">
                <MerchantPlanCards plans={plans} onEdit={handleEdit} onDelete={(p) => setDeleteConfirm(p)} onToggleStatus={handleToggleStatus} isTogglingId={togglingId} />
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-600">
                    Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
                  </p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isFetching} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      Previous
                    </button>
                    <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching} className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {(tab === "rider" || tab === "customer") && (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-16 text-center">
          <Gift className="h-14 w-14 text-gray-300 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700">{tab === "rider" ? "Rider" : "Customer"} offers coming soon</p>
          <p className="text-sm text-gray-500 mt-1">This section will be available in a future update</p>
        </div>
      )}

      <MerchantPlanForm
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditPlan(null);
        }}
        onSuccess={handleFormSuccess}
        editPlan={editPlan}
      />

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-medium text-gray-900">Delete plan?</p>
            <p className="text-sm text-gray-600 mt-1">
              &quot;{deleteConfirm.planName}&quot; ({deleteConfirm.planCode}) will be deactivated. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
              <button type="button" onClick={() => handleDelete(deleteConfirm)} disabled={deletePlan.isPending} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {deletePlan.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
