import * as Linking from "expo-linking";

/** Deep link that opens a merchant menu in the customer app. */
export function buildMerchantShareUrl(storePublicId: string): string {
  const id = storePublicId.trim();
  return Linking.createURL(`/home/merchant/${encodeURIComponent(id)}`);
}

export function buildMerchantShareMessage(storeName: string, url: string): string {
  return `Hey! Order from ${storeName} on GatiMitra.\n\n${url}`;
}

export function buildCheckoutShareMessage(
  storeName: string,
  url: string,
  itemNames?: string[]
): string {
  const trimmed = itemNames?.map((n) => n.trim()).filter(Boolean) ?? [];
  const itemsLine =
    trimmed.length > 0
      ? `\n${trimmed.slice(0, 3).join(", ")}${trimmed.length > 3 ? " & more" : ""}`
      : "";
  return `Hey! I'm ordering from ${storeName} on GatiMitra.${itemsLine}\n\nTap to order:\n${url}`;
}
