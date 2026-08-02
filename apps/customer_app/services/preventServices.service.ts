import api from "./api";

export const PREVENT_SERVICE_USER_MESSAGE =
  "This service is temporarily unavailable in your current location. Please try again later or choose another nearby location.";

export const PREVENT_SERVICE_ERROR_CODE = "SERVICE_BLOCKED_IN_LOCATION" as const;

export type PreventNearestMatch = {
  ruleId: string | null;
  locationName: string | null;
  reason: string | null;
  startsAt: string | null;
  endsAt: string | null;
  blockedServices: string[];
};

export type PreventCheckResult = {
  blocked: boolean;
  blockedServices: string[];
  code: string | null;
  message: string | null;
  title: string | null;
  nearest: PreventNearestMatch | null;
};

function mapNearest(raw: unknown): PreventNearestMatch | null {
  if (!raw || typeof raw !== "object") return null;
  const n = raw as Record<string, unknown>;
  return {
    ruleId: typeof n.ruleId === "string" ? n.ruleId : null,
    locationName: typeof n.locationName === "string" ? n.locationName : null,
    reason: typeof n.reason === "string" ? n.reason : null,
    startsAt: typeof n.startsAt === "string" ? n.startsAt : null,
    endsAt: typeof n.endsAt === "string" ? n.endsAt : null,
    blockedServices: Array.isArray(n.blockedServices)
      ? n.blockedServices.map(String)
      : [],
  };
}

export async function checkPreventServices(args: {
  lat: number;
  lng: number;
  service?: string;
  lat2?: number;
  lng2?: number;
}): Promise<PreventCheckResult> {
  try {
    const { data } = await api.post<{
      blocked?: boolean;
      blockedServices?: string[];
      code?: string | null;
      message?: string | null;
      title?: string | null;
      nearest?: unknown;
    }>("/v1/prevent-services/check", {
      lat: args.lat,
      lng: args.lng,
      service: args.service,
      lat2: args.lat2,
      lng2: args.lng2,
    });
    return {
      blocked: data?.blocked === true,
      blockedServices: data?.blockedServices ?? [],
      code: data?.code ?? null,
      message: data?.message ?? null,
      title: data?.title ?? null,
      nearest: mapNearest(data?.nearest),
    };
  } catch {
    return {
      blocked: false,
      blockedServices: [],
      code: null,
      message: null,
      title: null,
      nearest: null,
    };
  }
}
