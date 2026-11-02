export const HOME_AD_AUDIENCES = ["customer", "rider", "merchant"] as const;
export type HomeAdAudience = (typeof HOME_AD_AUDIENCES)[number];

export const HOME_AD_PLACEMENTS = ["home", "orders", "both"] as const;
export type HomeAdPlacement = (typeof HOME_AD_PLACEMENTS)[number];

export const HOME_AD_CTA_ACTIONS = ["bottom_sheet", "share", "redirect"] as const;
export type HomeAdCtaAction = (typeof HOME_AD_CTA_ACTIONS)[number];

export const HOME_AD_CTA_ACTION_LABEL: Record<HomeAdCtaAction, string> = {
  bottom_sheet: "Bottom sheet",
  share: "Share link",
  redirect: "Redirect",
};

export type HomeAdRow = {
  id: number;
  audience: HomeAdAudience;
  placement: HomeAdPlacement;
  title: string;
  body: string;
  image_r2_key: string | null;
  image_proxy_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  cta_action: HomeAdCtaAction;
  sheet_title: string | null;
  sheet_body: string | null;
  enabled: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
};

export function parseHomeAdAudience(value: string): HomeAdAudience | null {
  const v = String(value ?? "").trim().toLowerCase();
  return HOME_AD_AUDIENCES.includes(v as HomeAdAudience) ? (v as HomeAdAudience) : null;
}

export function parseHomeAdPlacement(value: string): HomeAdPlacement | null {
  const v = String(value ?? "").trim().toLowerCase();
  return HOME_AD_PLACEMENTS.includes(v as HomeAdPlacement) ? (v as HomeAdPlacement) : null;
}

export function parseHomeAdCtaAction(value: string): HomeAdCtaAction | null {
  const v = String(value ?? "").trim().toLowerCase();
  return HOME_AD_CTA_ACTIONS.includes(v as HomeAdCtaAction) ? (v as HomeAdCtaAction) : null;
}

export const HOME_AD_AUDIENCE_LABEL: Record<HomeAdAudience, string> = {
  customer: "Customer",
  rider: "Rider",
  merchant: "Merchant",
};
