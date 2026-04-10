"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useGeoUpsertMutation,
  useGeoCreatePricingRuleMutation,
  useRiderRateCardUpsertMutation,
} from "@/store/api/geoAdminApi";
import { toast } from "sonner";
import { GeoCascadeSelect, type CascadeValue } from "./GeoCascadeSelect";
import { cn } from "@/lib/utils";

function nameFromCascade(v: CascadeValue | null): string | null {
  if (!v) return null;
  const n = v.mode === "existing" ? v.name : v.name.trim();
  return n.length ? n : null;
}

type UpsertOk = {
  ok?: boolean;
  error?: string;
  pincodeId?: string;
  stateId?: string;
  regionId?: string;
  districtId?: string;
  divisionId?: string;
  postOfficeId?: string;
};

export const AddLocationForm = React.memo(function AddLocationForm(props: { onClose: () => void }) {
  const [state, setState] = useState<CascadeValue | null>(null);
  const [region, setRegion] = useState<CascadeValue | null>(null);
  const [district, setDistrict] = useState<CascadeValue | null>(null);
  const [division, setDivision] = useState<CascadeValue | null>(null);

  const [postOffice, setPostOffice] = useState("");
  const [pincode, setPincode] = useState("");
  const [branchType, setBranchType] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [isFood, setIsFood] = useState(true);
  const [isParcel, setIsParcel] = useState(true);
  const [isRide, setIsRide] = useState(true);

  const [baseFood, setBaseFood] = useState("");
  const [baseParcel, setBaseParcel] = useState("");
  const [baseRide, setBaseRide] = useState("");

  const [riderFood, setRiderFood] = useState({ base: "", km: "" });
  const [riderParcel, setRiderParcel] = useState({ base: "", km: "" });
  const [riderRide, setRiderRide] = useState({ base: "", km: "" });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const [upsertMut, { isLoading: upserting }] = useGeoUpsertMutation();
  const [priceMut] = useGeoCreatePricingRuleMutation();
  const [riderMut] = useRiderRateCardUpsertMutation();

  const stateId = state?.mode === "existing" ? state.id : null;
  const regionNew = region?.mode === "new";
  const districtNew = district?.mode === "new";
  const divisionNew = division?.mode === "new";

  const forceRegionManual = state?.mode === "new";
  const forceDistrictManual = state?.mode === "new" || regionNew;
  const forceDivisionManual = state?.mode === "new" || regionNew || districtNew;

  useEffect(() => {
    setRegion(null);
    setDistrict(null);
    setDivision(null);
    if (state?.mode === "new") {
      setRegion({ mode: "new", name: "" });
      setDistrict({ mode: "new", name: "" });
      setDivision({ mode: "new", name: "" });
    }
  }, [state]);

  useEffect(() => {
    setDistrict(null);
    setDivision(null);
    if (region?.mode === "new") {
      setDistrict({ mode: "new", name: "" });
      setDivision({ mode: "new", name: "" });
    }
  }, [region]);

  useEffect(() => {
    setDivision(null);
    if (district?.mode === "new") {
      setDivision({ mode: "new", name: "" });
    }
  }, [district]);

  const canSubmit = useMemo(() => {
    return (
      nameFromCascade(state) &&
      nameFromCascade(region) &&
      nameFromCascade(district) &&
      nameFromCascade(division) &&
      postOffice.trim().length > 0 &&
      pincode.trim().length > 0
    );
  }, [state, region, district, division, postOffice, pincode]);

  const input =
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20";

  async function applyPricingAndRider(pincodeId: string) {
    const tasks: Promise<unknown>[] = [];

    const baseEntries: Array<{ service: "food" | "parcel" | "ride"; val: string }> = [
      { service: "food", val: baseFood },
      { service: "parcel", val: baseParcel },
      { service: "ride", val: baseRide },
    ];
    for (const { service, val } of baseEntries) {
      const n = val.trim();
      if (n === "") continue;
      const num = Number(n);
      if (Number.isNaN(num)) continue;
      tasks.push(
        priceMut({
          level: "pincode",
          refId: pincodeId,
          service,
          ruleType: "base_fee",
          valueNumeric: num,
          priority: 10,
          isActive: true,
        }).unwrap()
      );
    }

    const riderEntries: Array<{
      service: "food" | "parcel" | "ride";
      base: string;
      km: string;
    }> = [
      { service: "food", base: riderFood.base, km: riderFood.km },
      { service: "parcel", base: riderParcel.base, km: riderParcel.km },
      { service: "ride", base: riderRide.base, km: riderRide.km },
    ];
    for (const { service, base, km } of riderEntries) {
      const b = base.trim();
      const k = km.trim();
      if (b === "" && k === "") continue;
      const bf = b === "" ? 0 : Number(b);
      const pk = k === "" ? 0 : Number(k);
      if (Number.isNaN(bf) || Number.isNaN(pk)) continue;
      tasks.push(
        riderMut({
          level: "pincode",
          refId: pincodeId,
          service,
          baseFare: bf,
          perKmRate: pk,
          minDistanceKm: 0,
          maxDistanceKm: null,
          waitingChargePerMin: 0,
          surgeMultiplier: 1,
          priority: 0,
          isActive: true,
          override: true,
        }).unwrap()
      );
    }

    if (tasks.length === 0) return;
    try {
      await Promise.all(tasks);
    } catch (e) {
      toast.message("Location saved; optional pricing/rider rules had errors.", {
        description: e instanceof Error ? e.message : "Check values and edit in tree.",
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) {
      toast.error("Complete hierarchy (through division), post office, and pincode.");
      return;
    }

    try {
      const res = await upsertMut({
        state: nameFromCascade(state)!,
        region: nameFromCascade(region)!,
        district: nameFromCascade(district)!,
        division: nameFromCascade(division)!,
        postOffice: postOffice.trim(),
        pincode: pincode.trim(),
        branchType: branchType || null,
        latitude: lat === "" ? null : Number(lat),
        longitude: lng === "" ? null : Number(lng),
        isFood,
        isParcel,
        isRide,
      }).unwrap();

      const body = res.result as UpsertOk;
      if (body && typeof body === "object" && body.ok === false) {
        toast.error(body.error ?? "Upsert failed");
        return;
      }

      const pinId = body?.pincodeId;
      if (pinId) {
        await applyPricingAndRider(pinId);
      }

      toast.success("Location saved");
      props.onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Request failed");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 text-sm">
      <div className="rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-50/50 to-white p-3 sm:p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-900">Hierarchy (state → division)</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Pick existing rows from the directory (search when lists are large). If something does not exist yet, choose{" "}
          <strong>Other (new)</strong> and type the name. When a parent is new, lower levels must be entered as new names
          until you save — then you can refine in the tree.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3">
          <GeoCascadeSelect
            label="State"
            level="state"
            parentId={null}
            stateId={null}
            value={state}
            onChange={setState}
            required
          />
          <GeoCascadeSelect
            label="Region"
            level="region"
            parentId={stateId}
            stateId={stateId}
            value={region}
            onChange={setRegion}
            disabled={!state}
            forceManualOnly={forceRegionManual}
            required
          />
          <GeoCascadeSelect
            label="District"
            level="district"
            parentId={region?.mode === "existing" ? region.id : null}
            stateId={stateId}
            value={district}
            onChange={setDistrict}
            disabled={!region}
            forceManualOnly={forceDistrictManual}
            required
          />
          <GeoCascadeSelect
            label="Division"
            level="division"
            parentId={district?.mode === "existing" ? district.id : null}
            stateId={stateId}
            value={division}
            onChange={setDivision}
            disabled={!district}
            forceManualOnly={forceDivisionManual}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="font-medium text-slate-700">Post office *</span>
          <input
            className={input}
            value={postOffice}
            onChange={(e) => setPostOffice(e.target.value)}
            required
            placeholder="Name as on ground"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">Pincode *</span>
          <input className={input} value={pincode} onChange={(e) => setPincode(e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">Branch type</span>
          <input className={input} value={branchType} onChange={(e) => setBranchType(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">Latitude</span>
          <input className={input} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">Longitude</span>
          <input className={input} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-700">Service availability</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Initial flags for this location (can be changed later in the tree).</p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={isFood} onChange={(e) => setIsFood(e.target.checked)} />
            Food
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={isParcel} onChange={(e) => setIsParcel(e.target.checked)} />
            Parcel
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" checked={isRide} onChange={(e) => setIsRide(e.target.checked)} />
            Ride
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
      >
        <span>Optional: customer base fee & rider payout at pincode</span>
        <span className="text-slate-400">{showAdvanced ? "−" : "+"}</span>
      </button>

      {showAdvanced ? (
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div>
            <p className="text-xs font-bold text-slate-800">Customer base fee (₹)</p>
            <p className="text-[11px] text-slate-500">Creates explicit <code className="rounded bg-slate-100 px-1">base_fee</code> rules on this pincode.</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-slate-500">Food</span>
                <input className={input} value={baseFood} onChange={(e) => setBaseFood(e.target.value)} placeholder="Optional" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-slate-500">Parcel</span>
                <input className={input} value={baseParcel} onChange={(e) => setBaseParcel(e.target.value)} placeholder="Optional" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase text-slate-500">Ride</span>
                <input className={input} value={baseRide} onChange={(e) => setBaseRide(e.target.value)} placeholder="Optional" />
              </label>
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-800">Rider payout (pincode)</p>
            <p className="text-[11px] text-slate-500">Base (₹) and per km (₹). Leave blank to configure later.</p>
            <div className="mt-2 space-y-2">
              {(
                [
                  ["food", riderFood, setRiderFood] as const,
                  ["parcel", riderParcel, setRiderParcel] as const,
                  ["ride", riderRide, setRiderRide] as const,
                ] as const
              ).map(([label, rv, setRv]) => (
                <div key={label} className="flex flex-wrap items-end gap-2 rounded-lg border border-teal-100 bg-teal-50/30 p-2">
                  <span className="w-14 shrink-0 text-[10px] font-bold uppercase text-teal-900">{label}</span>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-500">Base ₹</span>
                    <input
                      className={cn(input, "py-1.5 text-xs")}
                      value={rv.base}
                      onChange={(e) => setRv((x) => ({ ...x, base: e.target.value }))}
                    />
                  </label>
                  <label className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[9px] font-semibold text-slate-500">Per km ₹</span>
                    <input
                      className={cn(input, "py-1.5 text-xs")}
                      value={rv.km}
                      onChange={(e) => setRv((x) => ({ ...x, km: e.target.value }))}
                    />
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          onClick={props.onClose}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={upserting || !canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:bg-teal-500 disabled:opacity-50"
        >
          {upserting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {upserting ? "Saving…" : "Save location"}
        </button>
      </div>
    </form>
  );
});
