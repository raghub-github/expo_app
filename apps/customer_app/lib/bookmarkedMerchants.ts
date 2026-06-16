import { merchantService, type MerchantSummary } from "@/services/merchant.service";
import { getStoreDeliveryQuote } from "@/services/distance.service";

export type DeliveryDropContext = {
  addressId?: number | null;
  drop?: { lat: number; lng: number; pincode?: string | null; city?: string | null } | null;
};

export type BookmarkedMerchantRow = MerchantSummary & {
  /** null = location unknown; false = out of delivery range; true = can deliver. */
  serviceable: boolean | null;
};

async function resolveStoreServiceable(
  storeId: string,
  delivery: DeliveryDropContext
): Promise<boolean | null> {
  if (delivery.addressId == null && !delivery.drop) return null;
  try {
    const quote = await getStoreDeliveryQuote({
      storeId,
      addressId: delivery.addressId ?? undefined,
      drop: delivery.drop ?? undefined,
    });
    return quote.serviceable;
  } catch {
    return null;
  }
}

/** Menu header has ratings + ETA; list/about alone often miss review counts. */
async function fetchBookmarkedMerchantRow(
  storeId: string,
  delivery: DeliveryDropContext
): Promise<BookmarkedMerchantRow | null> {
  const serviceable = await resolveStoreServiceable(storeId, delivery);

  try {
    const detail = await merchantService.getMerchantById(storeId);
    const { menu: _menu, ...summary } = detail;
    return { ...summary, serviceable };
  } catch {
    try {
      const about = await merchantService.getMerchantAbout(storeId);
      return {
        id: storeId,
        name: about.store_display_name?.trim() || about.store_name,
        displayImage: about.banner_url ?? about.logo_url,
        banner_url: about.banner_url,
        isOpen: about.operational_status === "OPEN",
        liveStatus: about.operational_status === "OPEN" ? "OPEN" : "CLOSED",
        avgRating: null,
        totalReviews: null,
        serviceable,
      };
    } catch {
      return null;
    }
  }
}

export async function fetchBookmarkedMerchantsSummary(
  storeIds: string[],
  delivery: DeliveryDropContext
): Promise<BookmarkedMerchantRow[]> {
  if (storeIds.length === 0) return [];

  const rows = await Promise.all(
    storeIds.map((id) => fetchBookmarkedMerchantRow(id, delivery))
  );

  return rows.filter((row): row is BookmarkedMerchantRow => row != null);
}
