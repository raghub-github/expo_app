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
        const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
        const token = await this.getAccessToken?.();
        const headers = {
            "content-type": "application/json",
            ...(this.appVersion ? { "x-app-version": this.appVersion } : {}),
            ...(init.idempotencyKey ? { "x-idempotency-key": init.idempotencyKey } : {}),
        };
        if (token)
            headers.authorization = `Bearer ${token}`;
        const res = await fetch(url, {
            ...init,
            headers: {
                ...headers,
                ...init.headers,
            },
        });
        const text = await res.text();
        const payload = text ? safeJsonParse(text) : null;
        if (!res.ok) {
            throw new ApiError(`API ${res.status} ${res.statusText}`, res.status, payload);
        }
        if (init.responseSchema) {
            return init.responseSchema.parse(payload);
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