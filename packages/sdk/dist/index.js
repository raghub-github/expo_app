export class ApiError extends Error {
    status;
    payload;
    constructor(message, status, payload) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.payload = payload;
    }
}
/** Fetch aborted by a bounded client timeout — not a business failure. */
export class NetworkTimeoutError extends Error {
    timeoutMs;
    constructor(timeoutMs) {
        super(`Request timed out after ${timeoutMs}ms`);
        this.name = "NetworkTimeoutError";
        this.timeoutMs = timeoutMs;
    }
}
export class ApiClient {
    baseUrl;
    getAccessToken;
    appVersion;
    constructor(opts) {
        this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
        this.getAccessToken = opts.getAccessToken;
        this.appVersion = opts.appVersion;
    }
    async request(path, init = {}) {
        const { responseSchema, idempotencyKey, onBeforeFetch, headers: initHeaders, timeoutMs, ...fetchInit } = init;
        const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
        const token = this.getAccessToken?.();
        const resolvedToken = token instanceof Promise ? await token : token;
        const method = (fetchInit.method ?? "GET").toUpperCase();
        let body = fetchInit.body;
        const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
        const sendsJson = method === "POST" || method === "PUT" || method === "PATCH";
        // Fastify rejects application/json requests with an empty body (FST_ERR_CTP_EMPTY_JSON_BODY).
        if (sendsJson && !isFormData && (body == null || body === "")) {
            body = "{}";
        }
        const headers = {
            ...(sendsJson && !isFormData ? { "content-type": "application/json" } : {}),
            ...(this.appVersion ? { "x-app-version": this.appVersion } : {}),
            ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
            ...initHeaders,
        };
        if (resolvedToken)
            headers.authorization = `Bearer ${resolvedToken}`;
        onBeforeFetch?.();
        const timeoutController = timeoutMs != null && timeoutMs > 0 && !fetchInit.signal ? new AbortController() : null;
        let timeoutId;
        if (timeoutController) {
            timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
        }
        let res;
        try {
            res = await fetch(url, {
                ...fetchInit,
                method,
                body,
                headers,
                signal: timeoutController?.signal ?? fetchInit.signal,
            });
        }
        catch (err) {
            if (timeoutController?.signal.aborted) {
                throw new NetworkTimeoutError(timeoutMs ?? 0);
            }
            throw err;
        }
        finally {
            if (timeoutId)
                clearTimeout(timeoutId);
        }
        const text = await res.text();
        const payload = text ? safeJsonParse(text) : null;
        if (!res.ok) {
            throw new ApiError(`API ${res.status} ${res.statusText}`, res.status, payload);
        }
        if (responseSchema) {
            return responseSchema.parse(payload);
        }
        return payload;
    }
}
function safeJsonParse(s) {
    try {
        return JSON.parse(s);
    }
    catch {
        return s;
    }
}
//# sourceMappingURL=index.js.map