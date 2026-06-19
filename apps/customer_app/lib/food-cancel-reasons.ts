export type FoodCancelReason = {
  id: string;
  label: string;
};

export const FOOD_ORDER_CANCEL_REASONS: FoodCancelReason[] = [
  { id: "placed_by_mistake", label: "I placed the order by mistake" },
  { id: "wrong_address", label: "Wrong delivery address" },
  { id: "ordered_wrong_items", label: "Ordered wrong items" },
  { id: "taking_too_long", label: "Taking too long" },
  { id: "changed_mind", label: "Changed my mind" },
  { id: "other", label: "Other" },
];

export function resolveFoodCancelReasonLabel(reasonCode: string): string {
  const match = FOOD_ORDER_CANCEL_REASONS.find((r) => r.id === reasonCode);
  return match?.label ?? reasonCode.replace(/_/g, " ");
}
