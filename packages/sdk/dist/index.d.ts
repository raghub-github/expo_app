import { z } from "zod";
export declare class ApiError extends Error {
    readonly status: number;
    readonly payload: unknown;
    constructor(message: string, status: number, payload: unknown);
}
/** Fetch aborted by a bounded client timeout — not a business failure. */
export declare class NetworkTimeoutError extends Error {
    readonly timeoutMs: number;
    constructor(timeoutMs: number);
}
export type ApiClientOptions = {
    baseUrl: string;
    getAccessToken?: () => Promise<string | null> | string | null;
    appVersion?: string;
};
export declare class ApiClient {
    private readonly baseUrl;
    private readonly getAccessToken?;
    private readonly appVersion?;
    constructor(opts: ApiClientOptions);
    request<T>(path: string, init?: RequestInit & {
        responseSchema?: z.ZodSchema<T>;
        idempotencyKey?: string;
        onBeforeFetch?: () => void;
        /** Abort the request after this many ms. Unset = no client timeout. */
        timeoutMs?: number;
    }): Promise<T>;
}
//# sourceMappingURL=index.d.ts.map