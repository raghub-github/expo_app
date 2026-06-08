/** Server-side Fastify backend base URL (never defaults to partnersite port). */
export function resolveBackendApiBaseUrl(): string | null {
  const raw =
    process.env.GATIMITRA_BACKEND_API_URL ||
    process.env.MERCHANT_API_PROXY_TARGET ||
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.BACKEND_URL ||
    '';
  const trimmed = String(raw).trim().replace(/\/+$/, '');
  return trimmed || null;
}
