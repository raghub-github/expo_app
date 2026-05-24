import type { ApiFoodOrderItem } from "@/services/ordersApi";

function normLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Half / Full / Jumbo / Family pack — pill under item name, not in add-ons list. */
export function foodOrderVariantLabel(item: ApiFoodOrderItem): string | null {
  const tag = String(item.variant_tag ?? "").trim();
  if (tag) return tag;

  const variantLine = item.customization_lines?.find((l) => l.kind === "variant");
  if (variantLine?.name?.trim()) {
    const raw = variantLine.name.trim();
    const paren = raw.indexOf("(");
    return (paren > 0 ? raw.slice(0, paren) : raw).trim() || raw;
  }

  for (const line of item.customizations ?? []) {
    const t = line.trim();
    if (!t || t.startsWith("+")) continue;
    if (/₹\s*[\d.]+\s*$/.test(t)) continue;
    if (normLabel(t).startsWith("category:")) continue;
    const label = t.replace(/\s*·\s*₹[\d.]+\s*$/, "").trim();
    const paren = label.indexOf("(");
    return (paren > 0 ? label.slice(0, paren) : label).trim() || label;
  }
  return null;
}

/** Paid add-ons only (excludes size variant). */
export function foodOrderAddonRows(
  item: ApiFoodOrderItem,
): Array<{ label: string; amount: number | null }> {
  const variant = foodOrderVariantLabel(item);

  if (item.customization_lines?.length) {
    return item.customization_lines
      .filter((l) => l.kind === "addon")
      .map((l) => ({
        label: l.name,
        amount: l.amount > 0 ? l.amount : null,
      }));
  }

  return (item.customizations ?? [])
    .map((line) => {
      const m = line.match(/₹\s*([\d.]+)\s*$/);
      return {
        label: line.replace(/\s*·\s*₹[\d.]+\s*$/, "").trim(),
        amount: m ? Number(m[1]) : null,
      };
    })
    .filter((row) => {
      const label = normLabel(row.label);
      if (label.startsWith("category:")) return false;
      if (variant && normLabel(variant) === label) return false;
      return true;
    });
}
