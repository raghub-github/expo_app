export const STORE_DELISTED_CODE = "STORE_DELISTED" as const;

export const STORE_DELISTED_MESSAGE =
  "This store is delisted. You cannot turn it online until GatiMitra relists it. Please contact support.";

export function isStoreDelistedRow(row: {
  approval_status?: unknown;
  delisted_at?: unknown;
} | null | undefined): boolean {
  if (!row) return false;
  if (String(row.approval_status ?? "").toUpperCase() === "DELISTED") return true;
  return row.delisted_at != null && String(row.delisted_at).trim() !== "";
}

export function storeDelistedHttpBody(): {
  error: typeof STORE_DELISTED_CODE;
  code: typeof STORE_DELISTED_CODE;
  message: string;
} {
  return {
    error: STORE_DELISTED_CODE,
    code: STORE_DELISTED_CODE,
    message: STORE_DELISTED_MESSAGE,
  };
}
