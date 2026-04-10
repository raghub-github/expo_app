"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const cardCls = "rounded-xl border border-gray-200 bg-white p-5 text-gray-900 shadow-sm";
const sectionTitle = "text-base font-semibold text-gray-900";
const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const textareaCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-mono text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const selectCls =
  "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const selectFullCls = `${selectCls} w-full`;

type ServiceType = "FOOD" | "PARCEL" | "RIDE" | "ALL";

type RateCard = {
  id: number;
  name: string;
  service_type: string;
  city_name: string | null;
  priority: number;
  is_active: boolean;
};

type Slab = { id: number; min_km: number | null; max_km: number | null; base_fare: number; per_km_rate: number; priority: number };
type TimeSlot = { id: number; start_min: number; end_min: number; surge_multiplier: number; is_weekend_only: boolean };
type Zone = { id: number; zone_name: string | null; geojson: unknown; multiplier: number; priority: number; is_active: boolean };

function minutesToHHMM(m: number): string {
  const hh = Math.floor(m / 60) % 24;
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function hhmmToMinutes(s: string): number | null {
  const t = s.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hh = parseInt(m[1]!, 10);
  const mm = parseInt(m[2]!, 10);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export default function SuperAdminDeliveryRateCardsPage() {
  const [serviceType, setServiceType] = useState<ServiceType>("FOOD");
  const [tab, setTab] = useState<"cards" | "sim">("cards");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [cards, setCards] = useState<RateCard[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [cardForm, setCardForm] = useState({
    name: "",
    city_name: "",
    priority: "0",
    is_active: true,
    metadata: "",
  });
  const [slabsJson, setSlabsJson] = useState(`[{"min_km":0,"max_km":3,"base_fare":20,"per_km_rate":8,"priority":0}]`);
  const [timeSlotsJson, setTimeSlotsJson] = useState(`[{"start":"22:00","end":"06:00","surge_multiplier":1.2,"is_weekend_only":false}]`);
  const [zonesJson, setZonesJson] = useState(`[]`);

  const [simBody, setSimBody] = useState(`{\n  "serviceType": "FOOD",\n  "cityName": "Bengaluru",\n  "pickup": { "lat": 12.9716, "lng": 77.5946 },\n  "drop": { "lat": 12.9352, "lng": 77.6245 },\n  "orderValue": 299\n}`);
  const [simResult, setSimResult] = useState<string | null>(null);

  const filteredCards = useMemo(
    () => cards.filter((c) => (c.service_type ?? "FOOD") === serviceType || c.service_type === "ALL"),
    [cards, serviceType]
  );

  async function load(): Promise<void> {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/delivery-rate-cards?serviceType=${encodeURIComponent(serviceType)}`);
      const data = (await res.json()) as { cards?: RateCard[]; error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Failed to load");
      setCards(data.cards ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveCard(): Promise<void> {
    setErr(null);
    setBusy(true);
    try {
      const meta = cardForm.metadata.trim() ? JSON.parse(cardForm.metadata) : null;
      const slabsRaw = JSON.parse(slabsJson) as Array<any>;
      const timeRaw = JSON.parse(timeSlotsJson) as Array<any>;
      const zonesRaw = JSON.parse(zonesJson) as Array<any>;

      const slabs: Slab[] = (Array.isArray(slabsRaw) ? slabsRaw : []).map((s, idx) => ({
        id: 0,
        min_km: s.min_km ?? null,
        max_km: s.max_km ?? null,
        base_fare: Number(s.base_fare ?? 0) || 0,
        per_km_rate: Number(s.per_km_rate ?? 0) || 0,
        priority: Number(s.priority ?? idx) || 0,
      }));

      const time_slots: TimeSlot[] = (Array.isArray(timeRaw) ? timeRaw : []).map((t) => {
        const start = hhmmToMinutes(String(t.start ?? ""));
        const end = hhmmToMinutes(String(t.end ?? ""));
        if (start == null || end == null) throw new Error("Invalid time slot HH:MM");
        return {
          id: 0,
          start_min: start,
          end_min: end,
          surge_multiplier: Number(t.surge_multiplier ?? 1) || 1,
          is_weekend_only: Boolean(t.is_weekend_only ?? false),
        };
      });

      const zones: Zone[] = (Array.isArray(zonesRaw) ? zonesRaw : []).map((z, idx) => ({
        id: 0,
        zone_name: z.zone_name ?? null,
        geojson: z.geojson,
        multiplier: Number(z.multiplier ?? 1) || 1,
        priority: Number(z.priority ?? idx) || 0,
        is_active: Boolean(z.is_active ?? true),
      }));

      const body = {
        name: cardForm.name.trim(),
        service_type: serviceType,
        city_name: cardForm.city_name.trim() || null,
        priority: parseInt(cardForm.priority, 10) || 0,
        is_active: cardForm.is_active,
        metadata: meta,
        slabs,
        time_slots,
        zones,
      };

      const res = await fetch(
        selectedId != null ? `/api/super-admin/delivery-rate-cards/${selectedId}` : "/api/super-admin/delivery-rate-cards",
        {
          method: selectedId != null ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Save failed");
      await load();
      setSelectedId(null);
      setCardForm({ name: "", city_name: "", priority: "0", is_active: true, metadata: "" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function del(id: number): Promise<void> {
    if (!confirm("Delete rate card?")) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/super-admin/delivery-rate-cards/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? "Delete failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSim(): Promise<void> {
    setSimResult(null);
    setErr(null);
    setBusy(true);
    try {
      const body = JSON.parse(simBody) as any;
      const res = await fetch("/api/super-admin/delivery-fee/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      setSimResult(text);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 space-y-6 text-gray-900">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Delivery Rate Cards</h1>
          <p className="text-sm text-gray-600 mt-1 max-w-2xl">
            Delivery fee is computed by the Rate Card Engine + Distance Engine. Billing rules no longer decide delivery pricing.
          </p>
        </div>
        <Link href="/dashboard/super-admin" className="text-sm text-indigo-600 hover:underline shrink-0">
          ← Super Admin
        </Link>
      </header>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>}

      <div className="flex flex-wrap gap-2 items-center">
        <select className={selectCls} value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)}>
          <option value="FOOD">Food delivery</option>
          <option value="PARCEL">Parcel</option>
          <option value="RIDE">Person ride</option>
        </select>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void load()} disabled={busy}>
          {busy ? <span className="inline-flex items-center gap-2"><LoadingSpinner variant="button" size="sm" /> Loading…</span> : "Load"}
        </button>
        <button type="button" className={`rounded-lg px-3 py-2 text-sm border ${tab==="cards"?"bg-indigo-50 border-indigo-600":"bg-white border-gray-300"}`} onClick={() => setTab("cards")}>Manage</button>
        <button type="button" className={`rounded-lg px-3 py-2 text-sm border ${tab==="sim"?"bg-indigo-50 border-indigo-600":"bg-white border-gray-300"}`} onClick={() => setTab("sim")}>Simulator</button>
      </div>

      {tab === "cards" && (
        <div className="grid lg:grid-cols-2 gap-6">
          <section className={cardCls}>
            <h2 className={sectionTitle}>1. Rate card list</h2>
            <p className="text-sm text-gray-600 mt-1">Priority (smaller first). City can be blank for global.</p>
            <ul className="mt-3 space-y-2 max-h-[440px] overflow-auto text-sm">
              {filteredCards.map((c) => (
                <li key={c.id} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-gray-600">{c.service_type} · {c.city_name ?? "all cities"} · prio {c.priority} {c.is_active ? "" : " · off"}</div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button type="button" className="text-xs text-indigo-600" onClick={() => {
                      setSelectedId(c.id);
                      setCardForm({ name: c.name, city_name: c.city_name ?? "", priority: String(c.priority), is_active: c.is_active, metadata: "" });
                    }}>Edit</button>
                    <button type="button" className="text-xs text-red-600" onClick={() => void del(c.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={cardCls}>
            <h2 className={sectionTitle}>2. Create / edit</h2>
            <div className="mt-3 space-y-3">
              <input className={inputCls} placeholder="Rate card name" value={cardForm.name} onChange={(e) => setCardForm((f) => ({ ...f, name: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="City (optional)" value={cardForm.city_name} onChange={(e) => setCardForm((f) => ({ ...f, city_name: e.target.value }))} />
                <input className={inputCls} placeholder="Priority" value={cardForm.priority} onChange={(e) => setCardForm((f) => ({ ...f, priority: e.target.value }))} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={cardForm.is_active} onChange={(e) => setCardForm((f) => ({ ...f, is_active: e.target.checked }))} />
                Active
              </label>

              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Step 2: Distance slabs</div>
                <textarea className={textareaCls} rows={5} value={slabsJson} onChange={(e) => setSlabsJson(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Step 3: Time slots</div>
                <textarea className={textareaCls} rows={4} value={timeSlotsJson} onChange={(e) => setTimeSlotsJson(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Step 4: Zones (GeoJSON)</div>
                <textarea className={textareaCls} rows={4} value={zonesJson} onChange={(e) => setZonesJson(e.target.value)} />
              </div>
              <div>
                <div className="text-xs font-medium text-gray-600 mb-1">Metadata JSON (optional)</div>
                <textarea className={textareaCls} rows={2} value={cardForm.metadata} onChange={(e) => setCardForm((f) => ({ ...f, metadata: e.target.value }))} />
              </div>

              <div className="flex gap-2">
                <button type="button" className="rounded-lg bg-indigo-600 text-white text-sm font-medium px-4 py-2" onClick={() => void saveCard()} disabled={busy}>
                  {busy ? <span className="inline-flex items-center gap-2"><LoadingSpinner variant="button" size="sm" /> Saving…</span> : selectedId ? "Save" : "Create"}
                </button>
                {selectedId && (
                  <button type="button" className="rounded-lg border px-4 py-2 text-sm" onClick={() => { setSelectedId(null); setCardForm({ name: "", city_name: "", priority: "0", is_active: true, metadata: "" }); }}>
                    Cancel
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-600">
                Time slots format uses <code className="bg-gray-100 px-1 rounded">start</code>/<code className="bg-gray-100 px-1 rounded">end</code> as <code className="bg-gray-100 px-1 rounded">HH:MM</code>.
              </p>
            </div>
          </section>
        </div>
      )}

      {tab === "sim" && (
        <section className={cardCls}>
          <h2 className={sectionTitle}>Preview simulator</h2>
          <p className="text-sm text-gray-600 mt-1">
            Calls backend `POST /v1/delivery-fee/calculate` via dashboard proxy.
          </p>
          <textarea className={textareaCls + " mt-3"} rows={10} value={simBody} onChange={(e) => setSimBody(e.target.value)} />
          <div className="flex gap-2 mt-3">
            <button type="button" className="rounded-lg bg-gray-800 text-white text-sm px-4 py-2" onClick={() => void runSim()} disabled={busy}>
              {busy ? <span className="inline-flex items-center gap-2"><LoadingSpinner variant="button" size="sm" /> Running…</span> : "Run"}
            </button>
          </div>
          {simResult && (
            <pre className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs overflow-auto">{simResult}</pre>
          )}
        </section>
      )}
    </div>
  );
}

