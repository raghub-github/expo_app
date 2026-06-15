import { formatMobileForDisplay, normalizeMobileNumber } from "@/lib/utils/mobile-normalizer";

export type CustomerLinkedContactInput = {
  primaryMobile?: string | null;
  customerAlternateMobile?: string | null;
  orderAlternateContactPhone?: string | null;
  orderDeliveryPrimaryContactPhone?: string | null;
};

export function collectCustomerLinkedContactPhones(
  input: CustomerLinkedContactInput
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: string | null | undefined) => {
    if (!raw?.trim()) return;
    const normalized = normalizeMobileNumber(raw.trim());
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  add(input.primaryMobile);
  add(input.customerAlternateMobile);
  add(input.orderAlternateContactPhone);
  add(input.orderDeliveryPrimaryContactPhone);

  return out;
}

export function shouldShowCustomerContactsDropdown(input: CustomerLinkedContactInput): boolean {
  if (input.customerAlternateMobile?.trim()) return true;
  if (input.orderAlternateContactPhone?.trim()) return true;
  return collectCustomerLinkedContactPhones(input).length > 1;
}

export function formatLinkedContactPhone(phone: string): string {
  return formatMobileForDisplay(phone);
}
