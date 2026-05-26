/** Parse orders_core / orders_food merchant_instructions_list for partner UI. */

export function parseMerchantInstructionsList(raw: unknown): string[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    try {
      parsed = JSON.parse(t) as unknown;
    } catch {
      return [t];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of parsed) {
    if (typeof entry !== "string") continue;
    const line = entry.trim();
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

export function resolveMerchantInstructionsForDisplay(order: {
  merchant_instructions_list?: unknown;
  requires_utensils?: boolean | null;
  delivery_instructions?: string | null;
}): string[] {
  const list = parseMerchantInstructionsList(order.merchant_instructions_list);
  if (list.length > 0) return list;

  const instr = (order.delivery_instructions ?? "").trim();
  if (instr) {
    const segments = instr
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    if (segments.length > 0) return segments;
    return [instr];
  }

  if (order.requires_utensils === false) return ["Don't send cutlery"];
  if (order.requires_utensils === true) return ["Send cutlery"];
  return [];
}
