"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bike,
  Loader2,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  UtensilsCrossed,
  Package,
  Car,
} from "lucide-react";
import type { RiderOnboardingVehicleTypeRow } from "@/lib/db/operations/rider-onboarding-vehicle-types";
import type { RiderOnboardingDocumentTypeRow } from "@/lib/db/operations/rider-onboarding-document-types";
import type { RiderOnboardingVehicleCategoryRow } from "@/lib/db/operations/rider-onboarding-vehicle-categories";
import type {
  DispatchServiceCode,
  RiderVehicleCategoryServiceAssignmentRow,
} from "@/lib/db/operations/rider-vehicle-category-service-assignments";
import type { RiderVehicleTypeServiceAssignmentRow } from "@/lib/db/operations/rider-vehicle-type-service-assignments";
import { AssignedRideServiceSideSheet } from "@/components/riders/AssignedRideServiceSideSheet";
import { RideCatalogVehicleMappingPanel } from "@/components/riders/RideCatalogVehicleMappingPanel";
import { RiderVehicleTypeFormModal } from "@/components/riders/RiderVehicleTypeFormModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/context/ToastContext";
import type {
  CustomerRideServiceCatalogRow,
  RideCatalogVehicleRow,
} from "@/lib/db/operations/customer-ride-service-catalog-admin";

const FALLBACK_DOC_OPTIONS = ["dl", "rc", "rental_proof", "ev_proof"] as const;

const SERVICE_META: Record<
  DispatchServiceCode,
  { label: string; short: string; icon: typeof UtensilsCrossed }
> = {
  food: { label: "Food delivery", short: "Food", icon: UtensilsCrossed },
  parcel: { label: "Parcel delivery", short: "Parcel", icon: Package },
  person_ride: { label: "Person ride", short: "Person ride", icon: Car },
};

const SERVICE_CODES: DispatchServiceCode[] = ["food", "parcel", "person_ride"];

type ViewTab = "vehicle_types" | "assigned_ride" | "ride_catalog";

export type DocRequirementMode = "off" | "required" | "optional";

type FormState = {
  code: string;
  categoryCode: string;
  label: string;
  hint: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
  onboardingFlow: "dl_rc" | "rental_ev" | "payment";
  docModes: Record<string, DocRequirementMode>;
  hasOwnVehicle: boolean;
  requiresMaxSpeed: boolean;
  infoMessage: string;
  mapsToVehicleType: string;
};

function emptyDocModes(): Record<string, DocRequirementMode> {
  return {
    dl: "off",
    rc: "off",
    rental_proof: "off",
    ev_proof: "off",
  };
}

const emptyForm = (): FormState => ({
  code: "",
  categoryCode: "2_wheeler",
  label: "",
  hint: "",
  icon: "bicycle-outline",
  sortOrder: 0,
  isActive: true,
  onboardingFlow: "dl_rc",
  docModes: emptyDocModes(),
  hasOwnVehicle: false,
  requiresMaxSpeed: false,
  infoMessage: "",
  mapsToVehicleType: "",
});

function docModesFromRow(row: RiderOnboardingVehicleTypeRow): Record<string, DocRequirementMode> {
  const modes = emptyDocModes();
  for (const code of row.documentRequirements.required_docs ?? []) {
    modes[code] = "required";
  }
  for (const code of row.documentRequirements.optional_docs ?? []) {
    modes[code] = "optional";
  }
  return modes;
}

function rowToForm(row: RiderOnboardingVehicleTypeRow): FormState {
  return {
    code: row.code,
    categoryCode: row.categoryCode ?? "2_wheeler",
    label: row.label,
    hint: row.hint ?? "",
    icon: row.icon ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    onboardingFlow: row.onboardingFlow,
    docModes: docModesFromRow(row),
    hasOwnVehicle: Boolean(row.documentRequirements.has_own_vehicle),
    requiresMaxSpeed: Boolean(row.documentRequirements.requires_max_speed),
    infoMessage: row.infoMessage ?? "",
    mapsToVehicleType: row.mapsToVehicleType ?? "",
  };
}

function formToPayload(form: FormState) {
  const required_docs = Object.entries(form.docModes)
    .filter(([, mode]) => mode === "required")
    .map(([code]) => code);
  const optional_docs = Object.entries(form.docModes)
    .filter(([, mode]) => mode === "optional")
    .map(([code]) => code);
  return {
    code: form.code,
    categoryCode: form.categoryCode || null,
    label: form.label,
    hint: form.hint || null,
    icon: form.icon || null,
    sortOrder: form.sortOrder,
    isActive: form.isActive,
    onboardingFlow: form.onboardingFlow,
    documentRequirements: {
      required_docs,
      optional_docs,
      has_own_vehicle: form.hasOwnVehicle,
      requires_max_speed: form.requiresMaxSpeed,
    },
    infoMessage: form.infoMessage || null,
    mapsToVehicleType: form.mapsToVehicleType || null,
  };
}

function assignmentKey(categoryCode: string, serviceType: DispatchServiceCode) {
  return `${categoryCode}::${serviceType}`;
}

function vehicleAssignmentKey(vehicleTypeCode: string, serviceType: DispatchServiceCode) {
  return `${vehicleTypeCode}::${serviceType}`;
}

type SheetTarget = {
  categoryCode: string;
  categoryLabel: string;
  categoryHint: string | null;
  serviceType: DispatchServiceCode;
};

export default function RiderOnboardingVehicleTypesPage() {
  const { toast } = useToast();
  const [viewTab, setViewTab] = useState<ViewTab>("vehicle_types");
  const [rows, setRows] = useState<RiderOnboardingVehicleTypeRow[]>([]);
  const [docOptions, setDocOptions] = useState<RiderOnboardingDocumentTypeRow[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<RiderOnboardingVehicleCategoryRow[]>([]);
  const [assignments, setAssignments] = useState<RiderVehicleCategoryServiceAssignmentRow[]>([]);
  const [assignmentDraft, setAssignmentDraft] = useState<Record<string, boolean>>({});
  const [vehicleAssignmentDraft, setVehicleAssignmentDraft] = useState<Record<string, boolean>>({});
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null);
  const [rideCatalog, setRideCatalog] = useState<CustomerRideServiceCatalogRow[]>([]);
  const [rideCatalogVehicles, setRideCatalogVehicles] = useState<RideCatalogVehicleRow[]>([]);
  const [rideCatalogDraft, setRideCatalogDraft] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [showForm, setShowForm] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<"single" | "bulk">("single");
  const [pendingDeactivateId, setPendingDeactivateId] = useState<number | null>(null);

  const loadVehicleTypes = useCallback(async () => {
    const [vehicleRes, docRes, categoryRes] = await Promise.all([
      fetch("/api/super-admin/rider-onboarding-vehicle-types", { cache: "no-store" }),
      fetch("/api/super-admin/rider-onboarding-document-types", { cache: "no-store" }),
      fetch("/api/super-admin/rider-onboarding-vehicle-categories", { cache: "no-store" }),
    ]);
    const data = (await vehicleRes.json()) as {
      success?: boolean;
      rows?: RiderOnboardingVehicleTypeRow[];
      error?: string;
    };
    const docData = (await docRes.json()) as {
      success?: boolean;
      rows?: RiderOnboardingDocumentTypeRow[];
    };
    const categoryData = (await categoryRes.json()) as {
      success?: boolean;
      rows?: RiderOnboardingVehicleCategoryRow[];
    };
    if (!vehicleRes.ok || !data.success) throw new Error(data.error || "Failed to load vehicle types");
    setRows(data.rows ?? []);
    setDocOptions(docData.rows?.filter((d) => d.isActive) ?? []);
    setCategoryOptions(categoryData.rows?.filter((c) => c.isActive) ?? []);
  }, []);

  const loadAssignments = useCallback(async () => {
    const res = await fetch("/api/super-admin/rider-vehicle-category-service-assignments", {
      cache: "no-store",
    });
    const data = (await res.json()) as {
      success?: boolean;
      categoryRows?: RiderVehicleCategoryServiceAssignmentRow[];
      vehicleRows?: RiderVehicleTypeServiceAssignmentRow[];
      rows?: RiderVehicleCategoryServiceAssignmentRow[];
      error?: string;
    };
    if (!res.ok || !data.success) throw new Error(data.error || "Failed to load assignments");
    const list = data.categoryRows ?? data.rows ?? [];
    const vehicleList = data.vehicleRows ?? [];
    setAssignments(list);
    const draft: Record<string, boolean> = {};
    for (const row of list) {
      draft[assignmentKey(row.categoryCode, row.serviceType)] = row.isAssigned;
    }
    setAssignmentDraft(draft);
    const vehicleDraft: Record<string, boolean> = {};
    for (const row of vehicleList) {
      vehicleDraft[vehicleAssignmentKey(row.vehicleTypeCode, row.serviceType)] = row.isAssigned;
    }
    setVehicleAssignmentDraft(vehicleDraft);
  }, []);

  const loadRideCatalog = useCallback(async () => {
    const res = await fetch("/api/super-admin/customer-ride-service-catalog", { cache: "no-store" });
    const data = (await res.json()) as {
      success?: boolean;
      catalog?: CustomerRideServiceCatalogRow[];
      vehicles?: RideCatalogVehicleRow[];
      error?: string;
    };
    if (!res.ok || !data.success) throw new Error(data.error || "Failed to load ride catalog");
    const catalog = data.catalog ?? [];
    const vehicles = data.vehicles ?? [];
    setRideCatalog(catalog);
    setRideCatalogVehicles(vehicles);
    const draft: Record<string, string[]> = {};
    for (const row of vehicles) {
      draft[row.vehicleTypeCode] = [...row.catalogCodes];
    }
    setRideCatalogDraft(draft);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadVehicleTypes(), loadAssignments(), loadRideCatalog()]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Load failed", "error");
    } finally {
      setLoading(false);
    }
  }, [loadVehicleTypes, loadAssignments, loadRideCatalog, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [rows]
  );

  const sortedCategories = useMemo(
    () => [...categoryOptions].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    [categoryOptions]
  );

  const assignableDocs = useMemo(() => {
    if (docOptions.length) {
      return docOptions.map((d) => ({ code: d.code, label: d.label }));
    }
    return FALLBACK_DOC_OPTIONS.map((code) => ({ code, label: code }));
  }, [docOptions]);

  const vehiclesByCategory = useMemo(() => {
    const map = new Map<string, RiderOnboardingVehicleTypeRow[]>();
    for (const row of sortedRows) {
      const cat = row.categoryCode ?? "";
      if (!cat) continue;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(row);
    }
    return map;
  }, [sortedRows]);

  const activeVehiclesByCategory = useMemo(() => {
    const map = new Map<string, RiderOnboardingVehicleTypeRow[]>();
    for (const row of sortedRows) {
      if (!row.isActive) continue;
      const cat = row.categoryCode ?? "";
      if (!cat) continue;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(row);
    }
    return map;
  }, [sortedRows]);

  const assignmentCategories = useMemo(
    () =>
      sortedCategories.filter(
        (c) => (activeVehiclesByCategory.get(c.code)?.length ?? 0) > 0
      ),
    [sortedCategories, activeVehiclesByCategory]
  );

  const categoryVehicleSummary = useCallback(
    (categoryCode: string) => {
      const vehicles = activeVehiclesByCategory.get(categoryCode) ?? [];
      if (!vehicles.length) return "No active vehicles";
      return vehicles.map((v) => v.label).join(", ");
    },
    [activeVehiclesByCategory]
  );

  const isCategoryMasterOn = (categoryCode: string, serviceType: DispatchServiceCode) =>
    assignmentDraft[assignmentKey(categoryCode, serviceType)] ?? false;

  const isVehicleServiceOn = (vehicleTypeCode: string, serviceType: DispatchServiceCode) =>
    vehicleAssignmentDraft[vehicleAssignmentKey(vehicleTypeCode, serviceType)] ?? false;

  const isEffectiveVehicleService = (
    vehicleTypeCode: string,
    categoryCode: string,
    serviceType: DispatchServiceCode
  ) => {
    const vehicle = sortedRows.find((r) => r.code === vehicleTypeCode);
    if (!vehicle?.isActive) return false;
    return isCategoryMasterOn(categoryCode, serviceType) && isVehicleServiceOn(vehicleTypeCode, serviceType);
  };

  const isServiceEffectivelyOn = (categoryCode: string, serviceType: DispatchServiceCode) => {
    const vehicles = activeVehiclesByCategory.get(categoryCode) ?? [];
    return vehicles.some((v) => isEffectiveVehicleService(v.code, categoryCode, serviceType));
  };

  const assignedSummary = (categoryCode: string) =>
    SERVICE_CODES.filter((s) => isServiceEffectivelyOn(categoryCode, s))
      .map((s) => SERVICE_META[s].short)
      .join(", ") || "None";

  const effectiveVehicleCount = (categoryCode: string, serviceType: DispatchServiceCode) => {
    const vehicles = activeVehiclesByCategory.get(categoryCode) ?? [];
    return vehicles.filter((v) => isEffectiveVehicleService(v.code, categoryCode, serviceType)).length;
  };

  const openServiceSheet = (
    cat: RiderOnboardingVehicleCategoryRow,
    serviceType: DispatchServiceCode
  ) => {
    setSheetTarget({
      categoryCode: cat.code,
      categoryLabel: cat.label,
      categoryHint: categoryVehicleSummary(cat.code),
      serviceType,
    });
  };

  const toggleCategoryMaster = (categoryCode: string, serviceType: DispatchServiceCode, on: boolean) => {
    const key = assignmentKey(categoryCode, serviceType);
    setAssignmentDraft((prev) => ({ ...prev, [key]: on }));
    if (!on) {
      const vehicles = vehiclesByCategory.get(categoryCode) ?? [];
      setVehicleAssignmentDraft((prev) => {
        const next = { ...prev };
        for (const v of vehicles) {
          next[vehicleAssignmentKey(v.code, serviceType)] = false;
        }
        return next;
      });
    }
  };

  const toggleVehicleAssignment = (
    vehicleTypeCode: string,
    serviceType: DispatchServiceCode
  ) => {
    const key = vehicleAssignmentKey(vehicleTypeCode, serviceType);
    setVehicleAssignmentDraft((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const startCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
    setMenuOpenId(null);
  };

  const startEdit = (row: RiderOnboardingVehicleTypeRow) => {
    setEditId(row.id);
    setForm(rowToForm(row));
    setShowForm(true);
    setMenuOpenId(null);
  };

  const setDocMode = (doc: string, mode: DocRequirementMode) => {
    setForm((f) => ({
      ...f,
      docModes: { ...f.docModes, [doc]: mode },
    }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = formToPayload(form);
      const url = editId
        ? `/api/super-admin/rider-onboarding-vehicle-types/${editId}`
        : "/api/super-admin/rider-onboarding-vehicle-types";
      const res = await fetch(url, {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm());
      await loadVehicleTypes();
      toast(editId ? "Updated" : "Created", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteOne = async (id: number) => {
    const res = await fetch(`/api/super-admin/rider-onboarding-vehicle-types/${id}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) throw new Error(data.error || "Failed");
  };

  const selectedRows = useMemo(
    () => sortedRows.filter((r) => selectedIds.has(r.id)),
    [sortedRows, selectedIds]
  );

  const pendingSingleRow = useMemo(
    () => (pendingDeactivateId != null ? sortedRows.find((r) => r.id === pendingDeactivateId) : null),
    [pendingDeactivateId, sortedRows]
  );

  const startBulkDelete = () => {
    setBulkSelectMode(true);
    setSelectedIds(new Set(sortedRows.map((r) => r.id)));
    setMenuOpenId(null);
  };

  const cancelBulkDelete = () => {
    setBulkSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleRowSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.size === sortedRows.length ? new Set() : new Set(sortedRows.map((r) => r.id))
    );
  };

  const requestDelete = (id: number) => {
    setPendingDeactivateId(id);
    setConfirmKind("single");
    setConfirmOpen(true);
    setMenuOpenId(null);
  };

  const requestBulkDelete = () => {
    if (!selectedRows.length) {
      toast("Select at least one vehicle type to delete.", "error");
      return;
    }
    setConfirmKind("bulk");
    setConfirmOpen(true);
  };

  const runDeleteConfirmed = async () => {
    setSaving(true);
    try {
      if (confirmKind === "single" && pendingDeactivateId != null) {
        await deleteOne(pendingDeactivateId);
        toast("Deleted permanently", "success");
      } else if (confirmKind === "bulk") {
        const ids = selectedRows.map((r) => r.id);
        await Promise.all(ids.map((id) => deleteOne(id)));
        cancelBulkDelete();
        toast(`Deleted ${ids.length} vehicle type(s)`, "success");
      }
      await loadVehicleTypes();
      setConfirmOpen(false);
      setPendingDeactivateId(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeRow = (id: number) => {
    requestDelete(id);
  };

  const reactivate = async (row: RiderOnboardingVehicleTypeRow) => {
    setSaving(true);
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/super-admin/rider-onboarding-vehicle-types/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Failed");
      await loadVehicleTypes();
      toast("Reactivated", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveAssignments = async () => {
    setSaving(true);
    try {
      const categoryAssignments = sortedCategories.flatMap((cat) =>
        SERVICE_CODES.map((serviceType) => ({
          categoryCode: cat.code,
          serviceType,
          isAssigned: isCategoryMasterOn(cat.code, serviceType),
        }))
      );
      const vehicleAssignmentPatches = sortedRows.flatMap((v) =>
        SERVICE_CODES.map((serviceType) => ({
          vehicleTypeCode: v.code,
          serviceType,
          isAssigned: isVehicleServiceOn(v.code, serviceType),
        }))
      );
      const res = await fetch("/api/super-admin/rider-vehicle-category-service-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryAssignments, vehicleAssignments: vehicleAssignmentPatches }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      await loadAssignments();
      toast(
        "Service & vehicle assignments saved — rider dispatch will use these immediately.",
        "success"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveRideCatalog = async () => {
    setSaving(true);
    try {
      const updates = rideCatalogVehicles.map((row) => ({
        vehicleTypeCode: row.vehicleTypeCode,
        catalogCodes: rideCatalogDraft[row.vehicleTypeCode] ?? row.catalogCodes,
      }));
      const res = await fetch("/api/super-admin/customer-ride-service-catalog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        catalog?: CustomerRideServiceCatalogRow[];
        vehicles?: RideCatalogVehicleRow[];
        error?: string;
      };
      if (!res.ok || !data.success) throw new Error(data.error || "Save failed");
      await loadRideCatalog();
      toast("Ride catalog mapping saved — customer ride options update immediately.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const toggleRideCatalogVehicle = (vehicleTypeCode: string, catalogCode: string) => {
    setRideCatalogDraft((prev) => {
      const current = prev[vehicleTypeCode] ?? [];
      const has = current.some((c) => c === catalogCode);
      const next = has
        ? current.filter((c) => c !== catalogCode)
        : [...current, catalogCode];
      return { ...prev, [vehicleTypeCode]: next };
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900">
            <Bike className="h-5 w-5 shrink-0 text-emerald-600" />
            Rider vehicle types
          </h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
              {viewTab === "vehicle_types"
                ? "Manage operating vehicle options, required documents, and onboarding flow for the rider app."
                : viewTab === "assigned_ride"
                  ? "Assign dispatch services per vehicle category and specific vehicle types. Riders only receive offers for enabled vehicles."
                : "Map each vehicle to ride options (Bike, Bike Lite, Auto, Cab Economy, Cab Premium). Remap anytime."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => {
                cancelBulkDelete();
                setViewTab("vehicle_types");
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewTab === "vehicle_types"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Vehicle types
            </button>
            <button
              type="button"
              onClick={() => {
                cancelBulkDelete();
                setViewTab("assigned_ride");
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewTab === "assigned_ride"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Assigned ride
            </button>
            <button
              type="button"
              onClick={() => {
                cancelBulkDelete();
                setViewTab("ride_catalog");
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                viewTab === "ride_catalog"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Ride catalog
            </button>
          </div>

          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          {viewTab === "vehicle_types" ? (
            bulkSelectMode ? (
              <>
                <button
                  type="button"
                  onClick={cancelBulkDelete}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || selectedRows.length === 0}
                  onClick={() => requestBulkDelete()}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete selected ({selectedRows.length})
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={startBulkDelete}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Bulk delete
                </button>
                <button
                  type="button"
                  onClick={startCreate}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  <Plus className="h-4 w-4" />
                  Add vehicle
                </button>
              </>
            )
          ) : viewTab === "assigned_ride" ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveAssignments()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save assignments
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveRideCatalog()}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save catalog mapping
            </button>
          )}
        </div>
      </div>

      <RiderVehicleTypeFormModal
        open={viewTab === "vehicle_types" && showForm}
        editId={editId}
        form={form}
        setForm={setForm}
        categoryOptions={categoryOptions}
        assignableDocs={assignableDocs}
        saving={saving}
        onClose={() => {
          setShowForm(false);
          setEditId(null);
        }}
        onSave={() => void save()}
        onSetDocMode={setDocMode}
      />

      <ConfirmModal
        open={confirmOpen}
        title={
          confirmKind === "bulk"
            ? `Delete ${selectedRows.length} vehicle type(s)?`
            : "Delete vehicle type?"
        }
        description={
          confirmKind === "bulk" ? (
            <div className="space-y-2">
              <p>
                Only <strong>checked</strong> rows will be permanently removed from the database.
                Unchecked rows stay unchanged.
              </p>
              <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-xs text-slate-600">
                {selectedRows.map((row) => (
                  <li key={row.id}>
                    <span className="font-mono">{row.code}</span> — {row.label}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-slate-500">This cannot be undone. Add new types with + Add vehicle.</p>
            </div>
          ) : pendingSingleRow ? (
            <p>
              Permanently delete <strong>{pendingSingleRow.label}</strong> (
              <span className="font-mono text-xs">{pendingSingleRow.code}</span>) from the database?
              This cannot be undone.
            </p>
          ) : (
            "Permanently delete this vehicle type from the database? This cannot be undone."
          )
        }
        confirmLabel={confirmKind === "bulk" ? "Delete selected" : "Delete"}
        cancelLabel="Cancel"
        variant="danger"
        confirmBusy={saving}
        onClose={() => {
          if (!saving) {
            setConfirmOpen(false);
            setPendingDeactivateId(null);
          }
        }}
        onConfirm={runDeleteConfirmed}
      />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : viewTab === "vehicle_types" ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {bulkSelectMode ? (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={
                          sortedRows.length > 0 && selectedIds.size === sortedRows.length
                        }
                        onChange={toggleSelectAll}
                        aria-label="Select all vehicle types"
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                  ) : null}
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Label</th>
                  <th className="px-4 py-3">Flow</th>
                  <th className="px-4 py-3">Docs</th>
                  <th className="px-4 py-3">Status</th>
                  {!bulkSelectMode ? <th className="px-4 py-3 text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedRows.map((row) => {
                  const requiredDocs = row.documentRequirements.required_docs ?? [];
                  const optionalDocs = row.documentRequirements.optional_docs ?? [];
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/60">
                      {bulkSelectMode ? (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleRowSelected(row.id)}
                            aria-label={`Select ${row.label}`}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                        </td>
                      ) : null}
                      <td className="px-4 py-3 text-slate-700">{row.sortOrder}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-800">{row.code}</span>
                          {row.code === "own" ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">
                              Default
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">
                        {row.categoryCode ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.label}</div>
                        {row.hint ? <div className="text-xs text-slate-500">{row.hint}</div> : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.onboardingFlow}</td>
                      <td className="px-4 py-3">
                        {requiredDocs.length || optionalDocs.length ? (
                          <div className="flex flex-wrap gap-1">
                            {requiredDocs.map((doc) => (
                              <span
                                key={`req-${doc}`}
                                className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] text-emerald-800"
                                title="Required"
                              >
                                {doc}*
                              </span>
                            ))}
                            {optionalDocs.map((doc) => (
                              <span
                                key={`opt-${doc}`}
                                className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] text-amber-800"
                                title="Optional"
                              >
                                {doc}?
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                            row.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      {!bulkSelectMode ? (
                      <td className="px-4 py-3">
                        <div className="relative flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(row)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="rounded p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          {!row.isActive ? (
                            <button
                              type="button"
                              onClick={() => void reactivate(row)}
                              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                            >
                              <Play className="h-3.5 w-3.5" />
                              Activate
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setMenuOpenId(menuOpenId === row.id ? null : row.id)}
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="More actions"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuOpenId === row.id ? (
                            <div className="absolute right-0 top-9 z-10 min-w-[140px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"
                                onClick={() => startEdit(row)}
                              >
                                Edit details
                              </button>
                              <button
                                type="button"
                                className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                                onClick={() => removeRow(row.id)}
                              >
                                Delete
                              </button>
                              {!row.isActive ? (
                                <button
                                  type="button"
                                  className="block w-full px-3 py-2 text-left text-xs text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => void reactivate(row)}
                                >
                                  Activate
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : viewTab === "ride_catalog" ? (
          <RideCatalogVehicleMappingPanel
            catalog={rideCatalog}
            vehicles={rideCatalogVehicles}
            draft={rideCatalogDraft}
            onToggle={toggleRideCatalogVehicle}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Wheeler group</th>
                  {SERVICE_CODES.map((code) => (
                    <th key={code} className="px-4 py-3 text-center">
                      {SERVICE_META[code].short}
                    </th>
                  ))}
                  <th className="px-4 py-3">Dispatch offers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {assignmentCategories.length === 0 ? (
                  <tr>
                    <td colSpan={3 + SERVICE_CODES.length} className="px-4 py-10 text-center text-sm text-slate-500">
                      No active vehicle types yet. Add vehicles under the Vehicle types tab first.
                    </td>
                  </tr>
                ) : (
                  assignmentCategories.map((cat) => (
                  <tr key={cat.code} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{cat.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{cat.label}</div>
                      <div className="text-xs text-slate-500">{categoryVehicleSummary(cat.code)}</div>
                    </td>
                    {SERVICE_CODES.map((serviceType) => {
                      const Icon = SERVICE_META[serviceType].icon;
                      const on = isServiceEffectivelyOn(cat.code, serviceType);
                      const count = effectiveVehicleCount(cat.code, serviceType);
                      const total = (activeVehiclesByCategory.get(cat.code) ?? []).length;
                      return (
                        <td key={serviceType} className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openServiceSheet(cat, serviceType)}
                            className={`inline-flex flex-col items-center gap-0.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              on
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-white text-slate-400 hover:border-slate-300"
                            }`}
                            title={`Configure ${SERVICE_META[serviceType].label} vehicles`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Icon className="h-3.5 w-3.5" />
                              {on ? "On" : "Off"}
                            </span>
                            <span className="text-[10px] font-normal opacity-80">
                              {count}/{total} vehicles
                            </span>
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                        {assignedSummary(cat.code)}
                      </span>
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
            {assignments.length === 0 && assignmentCategories.length > 0 ? (
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-amber-700">
                No saved assignments yet — open a service cell, configure vehicles, and click Save
                assignments.
              </p>
            ) : null}
          </div>
        )}
      </div>

      {sheetTarget ? (
        <AssignedRideServiceSideSheet
          open={Boolean(sheetTarget)}
          onClose={() => setSheetTarget(null)}
          categoryCode={sheetTarget.categoryCode}
          categoryLabel={sheetTarget.categoryLabel}
          categoryHint={sheetTarget.categoryHint}
          serviceType={sheetTarget.serviceType}
          serviceMeta={SERVICE_META[sheetTarget.serviceType]}
          vehicles={activeVehiclesByCategory.get(sheetTarget.categoryCode) ?? []}
          categoryMasterOn={isCategoryMasterOn(sheetTarget.categoryCode, sheetTarget.serviceType)}
          onCategoryMasterChange={(on) =>
            toggleCategoryMaster(sheetTarget.categoryCode, sheetTarget.serviceType, on)
          }
          isVehicleOn={(code) => isVehicleServiceOn(code, sheetTarget.serviceType)}
          onVehicleToggle={(code) => toggleVehicleAssignment(code, sheetTarget.serviceType)}
        />
      ) : null}
    </div>
  );
}
