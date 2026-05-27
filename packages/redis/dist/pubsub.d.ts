export declare function publish(channel: string, payload: unknown): Promise<void>;
export type Unsubscribe = () => Promise<void>;
export declare function subscribe(channel: string, handler: (payload: unknown) => void): Promise<Unsubscribe>;
//# sourceMappingURL=pubsub.d.ts.map