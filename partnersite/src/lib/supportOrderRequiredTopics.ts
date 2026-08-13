/**
 * Partner support topics that require selecting an order before ticket create.
 * All other topics skip order pick and go straight to compose.
 */

const ORDER_REQUIRED_TOPIC_PATTERNS: RegExp[] = [
  /order\s+got\s+cancelled\s+by\s+mistake/i,
  /delivery\s+delay\s+issue/i,
  /wrong\s+order\s+received/i,
  /order\s+not\s+picked\s+by\s+rider/i,
  /order\s+delayed/i,
  /wrong\s+item\s+handed\s+over\s+to\s+the\s+rider/i,
];

export function topicRequiresOrderSelection(topicOrOption: string | null | undefined): boolean {
  const text = String(topicOrOption ?? "").trim();
  if (!text) return false;
  return ORDER_REQUIRED_TOPIC_PATTERNS.some((re) => re.test(text));
}
