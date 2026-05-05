"use client";

import { R2Image } from "@/components/ui/R2Image";
import { ITEM_PLACEHOLDER_SVG } from "./menu-types";

export function parseChangeRequestJson(val: unknown): unknown {
  if (val == null) return val;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    const t = val.trim();
    if (!t) return null;
    try {
      return JSON.parse(t);
    } catch {
      return val;
    }
  }
  return val;
}

export function formatChangeRequestValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "object") {
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

/** Same ordering as the edit form (main fields first, then nutrition, then nested JSON). */
const MENU_ITEM_CHANGE_FIELD_ORDER: string[] = [
  "item_name",
  "item_description",
  "item_image_url",
  "category_id",
  "food_type",
  "spice_level",
  "cuisine_type",
  "base_price",
  "selling_price",
  "discount_percentage",
  "tax_percentage",
  "in_stock",
  "available_quantity",
  "low_stock_threshold",
  "has_customizations",
  "has_addons",
  "has_variants",
  "is_popular",
  "is_recommended",
  "preparation_time_minutes",
  "packaging_enabled",
  "packaging_charges",
  "serves",
  "serves_label",
  "item_size_value",
  "item_size_unit",
  "available_for_delivery",
  "weight_per_serving",
  "weight_per_serving_unit",
  "calories_kcal",
  "protein",
  "protein_unit",
  "carbohydrates",
  "carbohydrates_unit",
  "fat",
  "fat_unit",
  "fibre",
  "fibre_unit",
  "item_tags",
  "is_active",
  "allergens",
  "customizations",
  "variants",
];

export function menuItemChangeFieldLabel(key: string): string {
  const labels: Record<string, string> = {
    item_name: "Item name",
    item_description: "Description",
    item_image_url: "Item image",
    category_id: "Category",
    food_type: "Food type",
    spice_level: "Spice level",
    cuisine_type: "Cuisine type",
    base_price: "Base price",
    selling_price: "Selling price",
    discount_percentage: "Discount %",
    tax_percentage: "Tax %",
    in_stock: "In stock",
    available_quantity: "Available quantity",
    low_stock_threshold: "Low stock threshold",
    has_customizations: "Has customizations",
    has_addons: "Has add-ons",
    has_variants: "Has variants",
    is_popular: "Popular",
    is_recommended: "Recommended",
    preparation_time_minutes: "Prep time (min)",
    packaging_enabled: "Packaging enabled",
    packaging_charges: "Packaging charges",
    serves: "Serves",
    serves_label: "Serves label",
    item_size_value: "Size value",
    item_size_unit: "Size unit",
    available_for_delivery: "Available for delivery",
    weight_per_serving: "Weight per serving",
    weight_per_serving_unit: "Weight unit",
    calories_kcal: "Calories (kcal)",
    protein: "Protein",
    protein_unit: "Protein unit",
    carbohydrates: "Carbohydrates",
    carbohydrates_unit: "Carbs unit",
    fat: "Fat",
    fat_unit: "Fat unit",
    fibre: "Fibre",
    fibre_unit: "Fibre unit",
    item_tags: "Tags",
    is_active: "Active",
    allergens: "Allergens",
    customizations: "Customizations",
    variants: "Variants",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function sortMenuItemChangeKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = MENU_ITEM_CHANGE_FIELD_ORDER.indexOf(a);
    const ib = MENU_ITEM_CHANGE_FIELD_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function isMenuItemImageFieldKey(key: string): boolean {
  return key === "item_image_url" || key.endsWith("_image_url") || key === "image_url";
}

function imageUrlFromChangeValue(key: string, value: unknown): string | null {
  if (!isMenuItemImageFieldKey(key)) return null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  // Dashboard APIs often return relative attachment URLs like "/api/attachments/proxy/key..."
  if (t.startsWith("/")) return t;
  return null;
}

export function ChangeRequestValueBox({
  fieldKey,
  value,
  variant,
}: {
  fieldKey: string;
  value: unknown;
  variant: "current" | "requested" | "solo";
}) {
  const tone =
    variant === "current"
      ? "border-slate-200 bg-slate-50/90"
      : variant === "requested"
        ? "border-emerald-200/80 bg-emerald-50/50"
        : "border-gray-200 bg-white";
  const imgUrl = imageUrlFromChangeValue(fieldKey, value);
  if (imgUrl) {
    return (
      <div className={`rounded-lg border ${tone} p-3`}>
        <div className="relative h-40 w-full max-w-[220px] overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
          <R2Image
            src={imgUrl}
            alt=""
            className="h-full w-full object-cover"
            fallbackSrc={ITEM_PLACEHOLDER_SVG}
          />
        </div>
        <p className="mt-2 text-[10px] leading-snug text-gray-500 break-all">{imgUrl}</p>
      </div>
    );
  }
  if (value !== null && typeof value === "object") {
    return (
      <pre
        className={`max-h-56 overflow-y-auto rounded-lg border ${tone} p-3 text-[11px] font-mono whitespace-pre-wrap break-words text-gray-800`}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  }
  return (
    <div
      className={`min-h-[2.5rem] rounded-lg border ${tone} px-3 py-2 text-sm text-gray-900`}
    >
      {formatChangeRequestValue(value)}
    </div>
  );
}

export function ChangeRequestFullPayloadPanels({
  requestType,
  currentObj,
  requestedObj,
  highlightKeys,
}: {
  requestType: string;
  currentObj: Record<string, unknown> | null;
  requestedObj: Record<string, unknown> | null;
  /** When provided, keys in this set are emphasized and others are faded. */
  highlightKeys?: Set<string> | null;
}) {
  if (requestType === "DELETE" && currentObj) {
    const keys = sortMenuItemChangeKeys(Object.keys(currentObj));
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Item state when the delete was requested.</p>
        {keys.map((key) => (
          <div
            key={key}
            className={`rounded-xl border bg-white p-4 shadow-sm transition ${
              highlightKeys
                ? highlightKeys.has(key)
                  ? "border-emerald-200 ring-2 ring-emerald-100"
                  : "border-gray-200 opacity-55"
                : "border-gray-200"
            }`}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {menuItemChangeFieldLabel(key)}
            </div>
            <div className="mt-2">
              <ChangeRequestValueBox fieldKey={key} value={currentObj[key]} variant="solo" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (requestType === "CREATE" && requestedObj) {
    const keys = sortMenuItemChangeKeys(Object.keys(requestedObj));
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Requested new item payload.</p>
        {keys.map((key) => (
          <div
            key={key}
            className={`rounded-xl border bg-white p-4 shadow-sm transition ${
              highlightKeys
                ? highlightKeys.has(key)
                  ? "border-emerald-200 ring-2 ring-emerald-100"
                  : "border-gray-200 opacity-55"
                : "border-gray-200"
            }`}
          >
            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {menuItemChangeFieldLabel(key)}
            </div>
            <div className="mt-2">
              <ChangeRequestValueBox fieldKey={key} value={requestedObj[key]} variant="solo" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (requestType === "UPDATE" && (currentObj || requestedObj)) {
    const keys = sortMenuItemChangeKeys([
      ...new Set([
        ...Object.keys(currentObj ?? {}),
        ...Object.keys(requestedObj ?? {}),
      ]),
    ]);
    return (
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Compare current store data with the merchant&apos;s requested changes (all fields).
        </p>
        {keys.map((key) => (
          <div
            key={key}
            className={`rounded-xl border bg-white p-4 shadow-sm transition ${
              highlightKeys
                ? highlightKeys.has(key)
                  ? "border-emerald-200 ring-2 ring-emerald-100"
                  : "border-gray-200 opacity-55"
                : "border-gray-200"
            }`}
          >
            <div className="mb-3 text-sm font-bold text-gray-900">{menuItemChangeFieldLabel(key)}</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Current
                </div>
                <ChangeRequestValueBox fieldKey={key} value={currentObj?.[key]} variant="current" />
              </div>
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Requested
                </div>
                <ChangeRequestValueBox fieldKey={key} value={requestedObj?.[key]} variant="requested" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function buildChangeRequestDiff(
  requestType: string,
  currentRaw: unknown,
  requestedRaw: unknown
): {
  intro: string | null;
  rows: { key: string; before: string; after: string; beforeRaw: unknown; afterRaw: unknown }[];
  fallbackCurrent: string | null;
  fallbackRequested: string | null;
} {
  const current = parseChangeRequestJson(currentRaw);
  const requested = parseChangeRequestJson(requestedRaw);

  if (requestType === "DELETE") {
    return {
      intro:
        "Merchant requested deletion. The snapshot below is the item as stored when this request was created.",
      rows: [],
      fallbackCurrent: current != null ? formatChangeRequestValue(current) : null,
      fallbackRequested: null,
    };
  }
  if (requestType === "CREATE") {
    return {
      intro: null,
      rows: [],
      fallbackCurrent: null,
      fallbackRequested: requested != null ? formatChangeRequestValue(requested) : null,
    };
  }
  const cObj =
    current != null && typeof current === "object" && !Array.isArray(current)
      ? (current as Record<string, unknown>)
      : null;
  const rObj =
    requested != null && typeof requested === "object" && !Array.isArray(requested)
      ? (requested as Record<string, unknown>)
      : null;
  const keys = new Set<string>();
  if (cObj) for (const k of Object.keys(cObj)) keys.add(k);
  if (rObj) for (const k of Object.keys(rObj)) keys.add(k);
  const rows: { key: string; before: string; after: string; beforeRaw: unknown; afterRaw: unknown }[] = [];
  for (const key of sortMenuItemChangeKeys(Array.from(keys))) {
    const bVal = cObj ? cObj[key] : undefined;
    const aVal = rObj ? rObj[key] : undefined;
    const bStr = formatChangeRequestValue(bVal);
    const aStr = formatChangeRequestValue(aVal);
    if (bStr === aStr) continue;
    rows.push({ key, before: bStr, after: aStr, beforeRaw: bVal, afterRaw: aVal });
  }
  if (rows.length === 0) {
    return {
      intro: "No per-field differences detected, or payloads are not objects. Full payloads are shown below.",
      rows: [],
      fallbackCurrent: current != null ? formatChangeRequestValue(current) : null,
      fallbackRequested: requested != null ? formatChangeRequestValue(requested) : null,
    };
  }
  return { intro: null, rows, fallbackCurrent: null, fallbackRequested: null };
}
