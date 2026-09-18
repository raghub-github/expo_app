export const FLASH_SALE_UNAVAILABLE = "FLASH_SALE_UNAVAILABLE";
export const FLASH_SALE_PRICE_STALE = "FLASH_SALE_PRICE_STALE";

export function isFlashSaleCheckoutError(data: {
  code?: string;
  error?: string;
  message?: string;
} | null | undefined): boolean {
  const c = String(data?.code ?? data?.error ?? "").toUpperCase();
  if (
    c === FLASH_SALE_UNAVAILABLE ||
    c === FLASH_SALE_PRICE_STALE ||
    c === "FLASH_SALE_ALREADY_USED" ||
    c === "FLASH_SALE_ALREADY_RESERVED"
  ) {
    return true;
  }
  const msg = String(data?.message ?? "").toUpperCase();
  return (
    msg.includes("FLASH_SALE_UNAVAILABLE") ||
    msg.includes("FLASH_SALE_PRICE_STALE") ||
    msg.includes("FLASH_SALE_ALREADY_USED") ||
    msg.includes("ALREADY USED THIS FLASH")
  );
}

export function flashSaleCheckoutMessage(data: { message?: string } | null | undefined): string {
  return (
    data?.message ??
    "This Flash Sale is no longer available. Prices were refreshed — please review your cart."
  );
}
