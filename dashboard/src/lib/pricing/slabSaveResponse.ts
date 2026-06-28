import type { Dispatch, SetStateAction } from "react";
import type { EditableCustomerSlabRow, EditableRideCustomerSlabRow } from "./slabEditableRows";
import {
  customerSlabFingerprint,
  rideCustomerSlabFingerprint,
} from "./slabDirtyState";
import { customerSlabFromApi, rideCustomerSlabFromApi } from "./slabEditableRows";

/** Apply API slab payload to editable rows + saved fingerprint map after a successful save. */
export function applyCustomerSlabSaveResponse(args: {
  previousId: number;
  slab: Record<string, unknown>;
  setSlabs: Dispatch<SetStateAction<EditableCustomerSlabRow[]>>;
  setSavedFingerprints: Dispatch<SetStateAction<Map<number, string>>>;
}) {
  const mapped = customerSlabFromApi(args.slab);
  args.setSlabs((prev) => prev.map((x) => (x.id === args.previousId ? mapped : x)));
  args.setSavedFingerprints((prev) => {
    const next = new Map(prev);
    if (args.previousId !== mapped.id) next.delete(args.previousId);
    next.set(mapped.id, customerSlabFingerprint(mapped));
    return next;
  });
  return mapped;
}

export function applyRideCustomerSlabSaveResponse(args: {
  previousId: number;
  slab: Record<string, unknown>;
  setSlabs: Dispatch<SetStateAction<EditableRideCustomerSlabRow[]>>;
  setSavedFingerprints: Dispatch<SetStateAction<Map<number, string>>>;
}) {
  const mapped = rideCustomerSlabFromApi(args.slab);
  args.setSlabs((prev) => prev.map((x) => (x.id === args.previousId ? mapped : x)));
  args.setSavedFingerprints((prev) => {
    const next = new Map(prev);
    if (args.previousId !== mapped.id) next.delete(args.previousId);
    next.set(mapped.id, rideCustomerSlabFingerprint(mapped));
    return next;
  });
  return mapped;
}
