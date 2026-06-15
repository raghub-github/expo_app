declare module '../../lib/dev-backend-url' {
  export const DEV_BACKEND_FALLBACK: string;
  export const PARTNERSITE_DEV_PORT: string;
  export function readBackendEnvRaw(): string;
  export function normalizeDevBackendUrl(raw: string): string;
}

declare module '../../lib/dev-backend-url.js' {
  export * from '../../lib/dev-backend-url';
}
