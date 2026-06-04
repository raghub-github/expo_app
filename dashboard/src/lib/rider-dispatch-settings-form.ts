import { formatRadiusDisplay } from "@/lib/rider-dispatch-radius";

export type DispatchServiceType = "food" | "parcel" | "person_ride";

export type WaveSettingsRow = {
  service_type: DispatchServiceType;
  wave_interval_seconds: number;
  max_waves: number;
  max_dispatch_radius_meters: number;
  enabled: boolean;
};

export type WaveExpansionRow = {
  service_type: DispatchServiceType;
  wave_number: number;
  effective_radius_meters: number;
};

export type BaseRadiusRow = {
  service_type: DispatchServiceType;
  radius_meters: number;
  radius_display: string;
};

export type ServiceFormState = {
  wave1_radius: string;
  wave_interval_seconds: string;
  max_waves: string;
  max_radius_input: string;
  enabled: boolean;
  rider_accept_flow: "before_merchant_accept" | "after_merchant_accept";
  expansion_radii: Record<number, string>;
};

export const DISPATCH_SERVICE_TYPES: DispatchServiceType[] = ["food", "parcel", "person_ride"];

export const emptyServiceForm = (): ServiceFormState => ({
  wave1_radius: "",
  wave_interval_seconds: "45",
  max_waves: "3",
  max_radius_input: "",
  enabled: true,
  rider_accept_flow: "before_merchant_accept",
  expansion_radii: {},
});

export function cloneDispatchForm(form: ServiceFormState): ServiceFormState {
  return { ...form, expansion_radii: { ...form.expansion_radii } };
}

function serializeFormState(form: ServiceFormState): string {
  const maxWaves = Math.min(10, Math.max(1, Number(form.max_waves) || 1));
  const expansion: Record<number, string> = {};
  for (let w = 2; w <= maxWaves; w++) {
    expansion[w] = (form.expansion_radii[w] ?? "").trim();
  }
  return JSON.stringify({
    wave1_radius: form.wave1_radius.trim(),
    wave_interval_seconds: form.wave_interval_seconds.trim(),
    max_waves: String(maxWaves),
    max_radius_input: form.max_radius_input.trim(),
    enabled: form.enabled,
    rider_accept_flow: form.rider_accept_flow,
    expansion_radii: expansion,
  });
}

export function isDispatchFormDirty(
  current: ServiceFormState,
  saved: ServiceFormState | undefined
): boolean {
  if (!saved) return false;
  return serializeFormState(current) !== serializeFormState(saved);
}

export function buildServiceForm(
  serviceType: DispatchServiceType,
  baseRadii: BaseRadiusRow[],
  settings: WaveSettingsRow[],
  expansions: WaveExpansionRow[],
  acceptFlows: Array<{ service_type: string; rider_accept_flow: string }>
): ServiceFormState {
  const base = baseRadii.find((r) => r.service_type === serviceType);
  const setting = settings.find((s) => s.service_type === serviceType);
  const acceptFlow = acceptFlows.find((f) => f.service_type === serviceType);
  const serviceExpansions = expansions
    .filter((e) => e.service_type === serviceType)
    .sort((a, b) => a.wave_number - b.wave_number);

  const expansion_radii: Record<number, string> = {};
  for (const ex of serviceExpansions) {
    expansion_radii[ex.wave_number] = formatRadiusDisplay(ex.effective_radius_meters);
  }

  return {
    wave1_radius: base?.radius_display ?? "",
    wave_interval_seconds: setting ? String(setting.wave_interval_seconds) : "45",
    max_waves: setting ? String(setting.max_waves) : "3",
    max_radius_input: setting
      ? formatRadiusDisplay(setting.max_dispatch_radius_meters)
      : "",
    enabled: setting?.enabled !== false,
    rider_accept_flow:
      acceptFlow?.rider_accept_flow === "after_merchant_accept"
        ? "after_merchant_accept"
        : "before_merchant_accept",
    expansion_radii,
  };
}

export type DispatchWavesApiPayload = {
  settings?: WaveSettingsRow[];
  expansions?: WaveExpansionRow[];
  base_radii?: BaseRadiusRow[];
  accept_flows?: Array<{ service_type: string; rider_accept_flow: string }>;
  error?: string;
};

export async function fetchDispatchWaveSettings(): Promise<{
  ok: boolean;
  error?: string;
  forms: Record<string, ServiceFormState>;
  savedForms: Record<string, ServiceFormState>;
}> {
  const res = await fetch("/api/super-admin/rider-dispatch-waves", { cache: "no-store" });
  const data = (await res.json().catch(() => ({}))) as DispatchWavesApiPayload;

  if (!res.ok) {
    return {
      ok: false,
      error: data.error || "Failed to load dispatch settings",
      forms: {},
      savedForms: {},
    };
  }

  const settings = Array.isArray(data.settings) ? data.settings : [];
  const expansions = Array.isArray(data.expansions) ? data.expansions : [];
  const baseRadii = Array.isArray(data.base_radii) ? data.base_radii : [];
  const acceptFlows = Array.isArray(data.accept_flows) ? data.accept_flows : [];

  const nextForms: Record<string, ServiceFormState> = {};
  for (const st of DISPATCH_SERVICE_TYPES) {
    nextForms[st] = buildServiceForm(st, baseRadii, settings, expansions, acceptFlows);
  }

  const savedForms = Object.fromEntries(
    DISPATCH_SERVICE_TYPES.map((st) => [st, cloneDispatchForm(nextForms[st])])
  ) as Record<string, ServiceFormState>;

  return { ok: true, forms: nextForms, savedForms };
}
