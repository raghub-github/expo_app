import type { MenuItemFullConfig } from "@/services/merchant.service";

const VARIANT_MIRROR_TITLES = new Set(["quantity", "size", "portion", "variant", "variants"]);

function dedupeVariants(variants: MenuItemFullConfig["variants"]) {
  const seen = new Set<string>();
  const sorted = [...variants].sort((a, b) => a.displayOrder - b.displayOrder);
  const out: MenuItemFullConfig["variants"] = [];
  for (const v of sorted) {
    const key = v.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

function dedupeAddons(addons: MenuItemFullConfig["customizations"][0]["addons"]) {
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const sorted = [...addons].sort((a, b) => a.displayOrder - b.displayOrder);
  const out: typeof addons = [];
  for (const a of sorted) {
    const name = a.name.trim();
    if (!name) continue;
    const id = String(a.id ?? "").trim();
    if (id && seenId.has(id)) continue;
    if (id) seenId.add(id);
    const nameKey = name.toLowerCase();
    if (seenName.has(nameKey)) continue;
    seenName.add(nameKey);
    out.push(a);
  }
  return out;
}

function isVariantMirrorGroup(
  title: string,
  addons: MenuItemFullConfig["customizations"][0]["addons"],
  variantNames: Set<string>
): boolean {
  if (variantNames.size === 0 || addons.length === 0) return false;
  const t = title.trim().toLowerCase();
  if (!VARIANT_MIRROR_TITLES.has(t) && !t.includes("size")) return false;
  const names = addons.map((a) => a.name.trim().toLowerCase()).filter(Boolean);
  return names.length > 0 && names.every((n) => variantNames.has(n));
}

/** Client-side cleanup for sheet UI (dedupe, drop empty rows, hide variant clones). */
export function normalizeMenuItemFullConfig(config: MenuItemFullConfig): MenuItemFullConfig {
  const variants = dedupeVariants(config.variants ?? []);
  const variantNames = new Set(variants.map((v) => v.name.trim().toLowerCase()).filter(Boolean));
  const customizations = (config.customizations ?? [])
    .map((c) => ({
      ...c,
      addons: dedupeAddons(c.addons ?? []),
    }))
    .filter((c) => c.addons.length > 0)
    .filter((c) => !isVariantMirrorGroup(c.title, c.addons, variantNames))
    .sort((a, b) => a.displayOrder - b.displayOrder);
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
    const byName = variants.find((v) => v.name.trim().toLowerCase() === key);
    if (byName) return byName.id;
  }
  const def = variants.find((v) => v.isDefault) ?? variants[0];
  return def?.id ?? null;
}
