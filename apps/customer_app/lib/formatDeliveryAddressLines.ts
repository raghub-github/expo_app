/**
 * Character-budget wrapping for delivery addresses across the Customer App.
 * Prefer word/comma boundaries; truncate the last line with an ellipsis when needed.
 */

export const DELIVERY_ADDRESS_LINE_LIMITS = [45, 45, 35] as const;

/** Take up to `max` characters, breaking at the last space/comma when reasonable. */
function takeLine(text: string, max: number): { line: string; consumed: number } {
  if (text.length <= max) {
    return { line: text, consumed: text.length };
  }

  const window = text.slice(0, max);
  const lastSpace = window.lastIndexOf(" ");
  const lastComma = window.lastIndexOf(",");
  const breakAt = Math.max(lastSpace, lastComma);
  const minBreak = Math.floor(max * 0.4);

  if (breakAt >= minBreak) {
    const includeComma = window[breakAt] === ",";
    const end = includeComma ? breakAt + 1 : breakAt;
    const line = window.slice(0, end).trimEnd();
    // Skip the break character (space) or continue after comma (+ following spaces).
    let consumed = end;
    while (consumed < text.length && text[consumed] === " ") consumed += 1;
    if (!includeComma && text[breakAt] === " ") {
      consumed = Math.max(consumed, breakAt + 1);
      while (consumed < text.length && text[consumed] === " ") consumed += 1;
    }
    return { line, consumed };
  }

  return { line: window.trimEnd(), consumed: max };
}

/**
 * Split a delivery address into at most 3 lines with limits 45 / 45 / 35.
 * Excess text is truncated on line 3 with `...`.
 */
export function formatDeliveryAddressLines(address: string | null | undefined): string[] {
  const text = String(address ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return [];

  const lines: string[] = [];
  let remaining = text;

  for (let i = 0; i < DELIVERY_ADDRESS_LINE_LIMITS.length; i++) {
    const max = DELIVERY_ADDRESS_LINE_LIMITS[i]!;
    const isLast = i === DELIVERY_ADDRESS_LINE_LIMITS.length - 1;

    if (!remaining) break;

    if (remaining.length <= max) {
      lines.push(remaining);
      break;
    }

    if (isLast) {
      const ellipsisBudget = Math.max(1, max - 3);
      const { line } = takeLine(remaining, ellipsisBudget);
      const trimmed = line.trimEnd();
      lines.push(`${trimmed}...`);
      break;
    }

    const { line, consumed } = takeLine(remaining, max);
    lines.push(line);
    remaining = remaining.slice(consumed).trimStart();
  }

  return lines;
}

/** Single string with newlines — for Text that supports multiline. */
export function formatDeliveryAddressMultiline(address: string | null | undefined): string {
  return formatDeliveryAddressLines(address).join("\n");
}
