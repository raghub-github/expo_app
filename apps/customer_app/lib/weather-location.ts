/** City/area hints for /v1/weather/location — never pass state names or placeholders. */

function isPlaceholder(value?: string | null): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed === "—" ||
    trimmed === "-" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unknown" ||
    lower === "current location"
  );
}

export function resolveWeatherCityFromAddress(args: {
  city?: string | null;
  state?: string | null;
  fullAddress?: string | null;
  areaFallback?: string | null;
}): string | undefined {
  const stateNorm = args.state?.trim().toLowerCase();
  if (args.city?.trim() && !isPlaceholder(args.city)) {
    const city = args.city.trim();
    if (city.toLowerCase() !== stateNorm) return city;
  }

  const parts = (args.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p.toLowerCase() !== "india" && !/^\d{6}$/.test(p));

  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2];
    if (candidate && candidate.toLowerCase() !== stateNorm && !isPlaceholder(candidate)) {
      return candidate;
    }
  }
  if (parts.length >= 2) {
    const candidate = parts[1];
    if (candidate && candidate.toLowerCase() !== stateNorm && !isPlaceholder(candidate)) {
      return candidate;
    }
  }
  if (parts[0] && !isPlaceholder(parts[0])) return parts[0];

  const areaFirst = args.areaFallback?.split(",")[0]?.trim();
  if (areaFirst && !isPlaceholder(areaFirst) && areaFirst.toLowerCase() !== stateNorm) {
    return areaFirst;
  }

  return undefined;
}
