const REGISTER_DRAFT_KEY = "gm_parent_register_draft_v1";

export type ParentRegisterDraft = {
  step: 1 | 2 | 3;
  email: string;
  verifiedEmail: string;
  emailUserId: string;
  mobile: string;
  owner_name?: string;
  parent_name?: string;
  merchant_type?: "LOCAL" | "BRAND" | "CHAIN" | "FRANCHISE";
  brand_name?: string;
  business_category?: string;
  business_category_other?: string;
  alternate_phone?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  referralCode?: string;
};

export function loadParentRegisterDraft(): ParentRegisterDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(REGISTER_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ParentRegisterDraft;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.verifiedEmail || !parsed.emailUserId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveParentRegisterDraft(draft: ParentRegisterDraft): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore quota / private mode
  }
}

export function clearParentRegisterDraft(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(REGISTER_DRAFT_KEY);
  } catch {
    // ignore
  }
}
