/** Merge assigned-captain fields from order detail + ride-status polls. */

export type CustomerCaptainProfile = {
  name: string;
  phone?: string;
  photoUrl?: string | null;
  rating?: number | null;
  deliveredOrdersCount?: number | null;
  vehicleRegistration?: string | null;
  vehicleModel?: string | null;
};

const PLACEHOLDER_NAME =
  /^(your\s+)?(captain|rider|delivery partner|mitra-sathi)$/i;

export function isPlaceholderCaptainName(name?: string | null): boolean {
  const n = name?.trim();
  if (!n) return true;
  return PLACEHOLDER_NAME.test(n);
}

function pickStr(a?: string | null, b?: string | null): string | undefined {
  const left = a?.trim();
  const right = b?.trim();
  return right || left || undefined;
}

export function mergeCaptainProfile(
  primary?: CustomerCaptainProfile | null,
  secondary?: CustomerCaptainProfile | null
): CustomerCaptainProfile | null {
  if (!primary && !secondary) return null;
  if (!primary) return secondary ?? null;
  if (!secondary) return primary;

  const primaryReal = !isPlaceholderCaptainName(primary.name);
  const secondaryReal = !isPlaceholderCaptainName(secondary.name);
  const name = secondaryReal
    ? secondary.name.trim()
    : primaryReal
      ? primary.name.trim()
      : pickStr(secondary.name, primary.name) || "Captain";

  return {
    name,
    phone: pickStr(primary.phone, secondary.phone),
    photoUrl: pickStr(primary.photoUrl, secondary.photoUrl) ?? null,
    rating: secondary.rating ?? primary.rating ?? null,
    deliveredOrdersCount:
      secondary.deliveredOrdersCount ?? primary.deliveredOrdersCount ?? null,
    vehicleRegistration: pickStr(primary.vehicleRegistration, secondary.vehicleRegistration),
    vehicleModel: pickStr(primary.vehicleModel, secondary.vehicleModel),
  };
}
