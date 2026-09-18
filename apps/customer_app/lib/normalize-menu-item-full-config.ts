import type { MenuItemFullConfig } from "@/services/merchant.service";
import { BASE_MENU_ITEM_VARIANT_ID, prependBaseMenuItemVariant } from "@/lib/menu-item-base-variant";

const VARIANT_MIRROR_TITLES = new Set(["quantity", "size", "portion", "variant", "variants"]);

function safeName(value: unknown): string {
  return String(value ?? "").trim();
}

function displayOrderOf(value: { displayOrder?: number | null }): number {
  const n = Number(value.displayOrder);
  return Number.isFinite(n) ? n : 0;
}

function dedupeVariants(variants: MenuItemFullConfig["variants"]) {
  const seen = new Set<string>();
  const sorted = [...variants].sort((a, b) => displayOrderOf(a) - displayOrderOf(b));
  const out: MenuItemFullConfig["variants"] = [];
  for (const v of sorted) {
    if (!v || typeof v !== "object") continue;
    const key = safeName(v.name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...v, name: safeName(v.name) || "Option" });
  }
  return out;
}

function dedupeAddons(addons: MenuItemFullConfig["customizations"][0]["addons"]) {
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const sorted = [...addons].sort((a, b) => displayOrderOf(a) - displayOrderOf(b));
  const out: typeof addons = [];
  for (const a of sorted) {
    if (!a || typeof a !== "object") continue;
    const name = safeName(a.name);
    if (!name) continue;
    const id = String(a.id ?? "").trim();
    if (id && seenId.has(id)) continue;
    if (id) seenId.add(id);
    const nameKey = name.toLowerCase();
    if (seenName.has(nameKey)) continue;
    seenName.add(nameKey);
    out.push({ ...a, name });
  }
  return out;
}

function isVariantMirrorGroup(
  title: string,
  addons: MenuItemFullConfig["customizations"][0]["addons"],
  variantNames: Set<string>
): boolean {
  if (variantNames.size === 0 || addons.length === 0) return false;
  const t = safeName(title).toLowerCase();
  if (!VARIANT_MIRROR_TITLES.has(t) && !t.includes("size")) return false;
  const names = addons.map((a) => safeName(a.name).toLowerCase()).filter(Boolean);
  return names.length > 0 && names.every((n) => variantNames.has(n));
}

/** Client-side cleanup for sheet UI (dedupe, drop empty rows, hide variant clones). */
export function normalizeMenuItemFullConfig(config: MenuItemFullConfig): MenuItemFullConfig {
  if (!config?.item) {
    throw new Error("Invalid menu item config");
  }
  const deduped = dedupeVariants(Array.isArray(config.variants) ? config.variants : []);
  const variants =
    deduped.some((v) => v.id === BASE_MENU_ITEM_VARIANT_ID)
      ? deduped
      : prependBaseMenuItemVariant(
          {
            name: safeName(config.item.name) || "Regular",
            price: Number(config.item.price) || 0,
            sizeValue: config.item.sizeValue ?? null,
            sizeUnit: config.item.sizeUnit ?? null,
            sizePreset: config.item.sizePreset ?? null,
          },
          deduped
        ).map((v) => ({ ...v, type: v.type ?? null }));
  const variantNames = new Set(variants.map((v) => safeName(v.name).toLowerCase()).filter(Boolean));
  const customizations = (Array.isArray(config.customizations) ? config.customizations : [])
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      ...c,
      title: safeName(c.title) || "Options",
      addons: dedupeAddons(c.addons ?? []),
    }))
    .filter((c) => c.addons.length > 0)
    .filter((c) => !isVariantMirrorGroup(c.title, c.addons, variantNames))
    .sort((a, b) => displayOrderOf(a) - displayOrderOf(b));
  return { ...config, variants, customizations };
}

export function resolveInitialVariantId(
  variants: MenuItemFullConfig["variants"],
  initial?: { variantId?: string | null; variantName?: string | null } | null
): string | null {
  if (!variants.length) return null;
  if (initial?.variantId) {
    const byId = variants.find((v) => v.id === initial.variantId);
    if (byId) return byId.id;
  }
  if (initial?.variantName?.trim()) {
    const key = initial.variantName.trim().toLowerCase();
    const byName = variants.find((v) => safeName(v.name).toLowerCase() === key);
    if (byName) return byName.id;
  }
  if (!initial?.variantId && !initial?.variantName?.trim()) {
    const baseVariant = variants.find((v) => v.id === BASE_MENU_ITEM_VARIANT_ID);
    if (baseVariant) return baseVariant.id;
  }
  const def = variants.find((v) => v.isDefault) ?? variants[0];
  return def?.id ?? null;
}
