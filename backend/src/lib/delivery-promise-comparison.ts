/**
 * Delivery promise comparison — "Delivered X min faster than promised".
 */

export type DeliveryPromiseComparison = {
  promisedMinutes: number;
  actualMinutes: number;
  deltaMinutes: number;
  message: string;
};

export function buildDeliveryPromiseComparison(args: {
  promisedEtaMinutes: number | null;
  placedAt: Date | string | null;
  deliveredAt: Date | string | null;
}): DeliveryPromiseComparison | null {
  const promised = args.promisedEtaMinutes;
  if (promised == null || !Number.isFinite(promised) || promised <= 0) return null;

  const placed = args.placedAt instanceof Date ? args.placedAt : args.placedAt ? new Date(args.placedAt) : null;
  const delivered =
    args.deliveredAt instanceof Date
      ? args.deliveredAt
      : args.deliveredAt
        ? new Date(args.deliveredAt)
        : null;

  if (!placed || !delivered || !Number.isFinite(placed.getTime()) || !Number.isFinite(delivered.getTime())) {
    return null;
  }

  const actualMinutes = Math.max(1, Math.round((delivered.getTime() - placed.getTime()) / 60_000));
  const deltaMinutes = actualMinutes - Math.round(promised);

  let message: string;
  if (Math.abs(deltaMinutes) <= 2) {
    message = "Delivered right on time";
  } else if (deltaMinutes < 0) {
    message = `Delivered ${Math.abs(deltaMinutes)} min faster than promised`;
  } else {
    message = `Delivered ${deltaMinutes} min later than promised`;
  }

  return {
    promisedMinutes: Math.round(promised),
    actualMinutes,
    deltaMinutes,
    message,
  };
}
