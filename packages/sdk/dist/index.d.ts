import { z } from "zod";
export declare class ApiError extends Error {
    readonly status: number;
    readonly payload: unknown;
    constructor(message: string, status: number, payload: unknown);
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
    }): Promise<T>;
}
//# sourceMappingURL=index.d.ts.map