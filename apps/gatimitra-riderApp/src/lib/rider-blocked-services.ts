export type RiderBlockedService = "food" | "parcel" | "person_ride";

export function normalizeRiderBlockedService(
  value: string
): RiderBlockedService | null {
  const x = (value || "").toLowerCase().trim();
  if (x === "food") return "food";
  if (x === "parcel") return "parcel";
  if (x === "ride" || x === "person_ride") return "person_ride";
  return null;
}

export function mergeRiderBlockedServices(
  ...lists: Array<string[] | null | undefined>
): RiderBlockedService[] {
  const out = new Set<RiderBlockedService>();
  for (const list of lists) {
    for (const raw of list ?? []) {
      const norm = normalizeRiderBlockedService(raw);
      if (norm) out.add(norm);
    }
  }
  return [...out];
}

/** Agent blacklist OR auto wallet block — show red Account Restricted banner. */
export function shouldShowAccountRestrictedBanner(input: {
  accountRestricted?: boolean;
  globalWalletBlock?: boolean;
  blockedServices: RiderBlockedService[];
  dutyAccountRestricted?: boolean;
}): boolean {
  return (
    input.accountRestricted === true ||
    input.dutyAccountRestricted === true ||
    input.globalWalletBlock === true ||
    input.blockedServices.length > 0
  );
}

export function orderCategoryToBlockedService(
  category: string
): RiderBlockedService | null {
  const x = (category || "").toLowerCase().trim();
  if (x === "food") return "food";
  if (x === "parcel") return "parcel";
  if (x === "ride") return "person_ride";
  return null;
}

export function isOrderCategoryDispatchBlocked(
  category: string,
  blockedServices: RiderBlockedService[],
  allServicesBlacklisted?: boolean
): boolean {
  if (allServicesBlacklisted === true || blockedServices.length >= 3) return true;
  const service = orderCategoryToBlockedService(category);
  if (!service) return false;
  return blockedServices.includes(service);
}

/** True when order category matches rider's active duty service selection. */
export function isOrderCategoryInAllowedDutyServices(
  category: string,
  allowedServiceTypes: string[] | null | undefined
): boolean {
  if (!allowedServiceTypes?.length) return false;
  const service = orderCategoryToBlockedService(category);
  if (!service) return true;
  return allowedServiceTypes.includes(service);
}

/** True when the rider must not poll or accept any dispatch offers. */
export function isRiderFullyDispatchBlocked(input: {
  accountRestricted?: boolean;
  allServicesBlacklisted?: boolean;
  blockedServices: RiderBlockedService[];
}): boolean {
  return (
    input.allServicesBlacklisted === true ||
    (input.accountRestricted === true && input.blockedServices.length >= 3)
  );
}
