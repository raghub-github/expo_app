/** Customer cutlery choice as shown on checkout (matches customer app copy). */
const LABEL_SEND_CUTLERY = 'Send cutlery & utensils';
const LABEL_NO_CUTLERY = "Don't send cutlery";

/**
 * Exact cutlery instruction the customer chose at checkout.
 * Returns null when there is no cutlery-related preference to show.
 */
export function getUtensilsCustomerLabel(order: {
  requires_utensils?: boolean | null;
  delivery_instructions?: string | null;
}): string | null {
  const instr = (order.delivery_instructions ?? '').trim();

  if (/no cutlery/i.test(instr) || order.requires_utensils === false) {
    return LABEL_NO_CUTLERY;
  }

  if (order.requires_utensils === true) {
    const segment = instr
      .split('|')
      .map((p) => p.trim())
      .find((p) => /cutlery|utensil/i.test(p));
    if (segment) return segment;
    return LABEL_SEND_CUTLERY;
  }

  const onlyCutlery = instr
    .split('|')
    .map((p) => p.trim())
    .find((p) => /cutlery|utensil/i.test(p));
  return onlyCutlery ?? null;
}
