import api from "./api";



export type CustomerAccountServiceBlock = {

  service:

    | "food"

    | "parcel"

    | "person_ride"

    | "ecommerce"

    | "vouchers"

    | "near_me";

  reason: string;

  blocked_at: string;

};



export type CustomerAccountBlocksMap = {

  food?: string;

  ride?: string;

  parcels?: string;

  ecom?: string;

  vouchers?: string;

  "near-me"?: string;

};



export function mapCustomerAccountBlocks(

  blocks: CustomerAccountServiceBlock[]

): CustomerAccountBlocksMap {

  const map: CustomerAccountBlocksMap = {};

  for (const b of blocks) {

    if (b.service === "food") map.food = b.reason;

    if (b.service === "parcel") map.parcels = b.reason;

    if (b.service === "person_ride") map.ride = b.reason;

    if (b.service === "ecommerce") map.ecom = b.reason;

    if (b.service === "vouchers") map.vouchers = b.reason;

    if (b.service === "near_me") map["near-me"] = b.reason;

  }

  return map;

}



export async function fetchCustomerServiceBlocks(): Promise<CustomerAccountServiceBlock[]> {

  try {

    const { data } = await api.get<{ blocks: CustomerAccountServiceBlock[] }>("/v1/me/service-blocks", {

      timeout: 12000,

    });

    return Array.isArray(data?.blocks) ? data.blocks : [];

  } catch (err) {

    if (__DEV__) {
      console.warn("[service-blocks] fetch failed", err);
    }

    throw err;

  }

}

