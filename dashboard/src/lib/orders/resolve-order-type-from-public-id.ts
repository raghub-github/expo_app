export type CoreOrderType = "food" | "parcel" | "person_ride";

/** Map formatted public id prefix to orders_core.order_type (GMF/GMC/GMP). */
export function resolveOrderTypeFromPublicId(publicId: string): CoreOrderType {
  const id = publicId.trim().replace(/^#/, "").toUpperCase();
  if (id.startsWith("GMP")) return "person_ride";
  if (id.startsWith("GMC")) return "parcel";
  if (id.startsWith("GMF")) return "food";
  return "food";
}
