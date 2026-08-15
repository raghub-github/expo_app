/**
 * Rider geo directory — the Super Admin "Geo Rx Availability" dashboard's view of
 * riders near a point: richer and broader than dispatch's candidate list (any
 * on-duty rider regardless of which services they've selected, plus admin-facing
 * fields like locality/store/stats), but the online/busy/stale/offline status is
 * derived by the SAME freshness rule as `availabilityEngine.ts` — this is what
 * closes the reported bug (dashboard showing a rider ONLINE while the customer
 * app, using `queryRiderAvailabilityCandidates`, correctly refused to dispatch to
 * them because their GPS was stale). Previously this lived as hand-rolled SQL
 * inside `dashboard/src/lib/area-manager/queries.ts`; that file now calls this.
 */
import type { Sql } from "postgres";
export type RiderOnlineStatus = "ONLINE" | "BUSY" | "STALE" | "OFFLINE";
/**
 * Pure status derivation — no DB access, unit-testable. Off duty always wins;
 * duty ON with a stale GPS fix is STALE (not ONLINE, not silently OFFLINE) —
 * this is the exact distinction the dashboard was missing before.
 */
export declare function deriveOnlineStatus(args: {
    dutyStatus: string | null;
    locationFresh: boolean;
    hasActiveOrder: boolean;
}): RiderOnlineStatus;
export type RiderGeoDirectoryEntry = {
    riderId: number;
    mobile: string;
    name: string | null;
    lat: number;
    lng: number;
    distanceMeters: number;
    status: RiderOnlineStatus;
    locationFresh: boolean;
    locationUpdatedAt: Date | null;
    localityCode: string | null;
    city: string | null;
    storeName: string | null;
    /** Active duty services from latest duty_logs — populated regardless of status
     *  (ONLINE/BUSY/STALE all mean "duty ON"; only OFFLINE clears this). */
    dutyServiceTypes: string[];
    currentAssignedOrderDisplayId: string | null;
    totalDeliveredOrders: number;
    totalCancelledOrders: number;
};
export type QueryGeoDirectoryArgs = {
    lat: number;
    lng: number;
    radiusMeters: number;
    /** Default RIDER_DISPATCH_LOCATION_MAX_AGE_MINUTES (10). */
    freshnessMaxAgeMinutes?: number;
    areaManagerId?: number | null;
    limit?: number;
};
/**
 * Every rider with a GPS fix inside `radiusMeters` of (lat, lng), regardless of
 * which services they've selected (a directory, not a per-service candidate
 * list — see `queryRiderAvailabilityCandidates` for that). Status/freshness use
 * the same rule as the rest of this package.
 */
export declare function queryRiderGeoDirectory(sql: Sql, args: QueryGeoDirectoryArgs): Promise<RiderGeoDirectoryEntry[]>;
//# sourceMappingURL=geoDirectory.d.ts.map