export type PushOsPermissionStatus = "undetermined" | "granted" | "denied" | "blocked";

export type NativePushTokenType = "fcm" | "apns";

export type PushBackendSyncStatus = "idle" | "syncing" | "ok" | "error";

export type PushControllerSnapshot = {
  osStatus: PushOsPermissionStatus;
  canAskAgain: boolean;
  expoGoUnsupported: boolean;
  loading: boolean;
  syncStatus: PushBackendSyncStatus;
  error: string | null;
  expoPushToken: string | null;
  nativePushToken: string | null;
  nativeTokenType: NativePushTokenType | null;
  lastBackendSyncAt: number | null;
  lastBackendSyncOk: boolean | null;
};

export type PushAuthContext = {
  accessToken: string;
  role: "customer" | "rider" | "merchant";
  /** Merchant store for `merchant_store_<id>` topic reconciliation. */
  storeId?: number | null;
};

export type PushDeviceMetadata = {
  device_model?: string | null;
  device_brand?: string | null;
  os_name?: string | null;
  os_version?: string | null;
  app_version?: string | null;
  locale?: string | null;
  timezone?: string | null;
};

export type PushNotificationOpenPayload = {
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
};

export type PushControllerOptions = {
  apiBaseUrl: string;
  getAuth: () => PushAuthContext | null;
  androidChannels?: Array<{
    channelId: string;
    name: string;
    importance?: number;
    vibrationPattern?: number[];
    lightColor?: string;
    /** Android raw sound name (no extension). */
    sound?: string;
  }>;
  /** Android package for APP_NOTIFICATION_SETTINGS. */
  androidPackageName?: string;
  collectDeviceMetadata?: () => Promise<PushDeviceMetadata>;
  onForeground?: (payload: PushNotificationOpenPayload) => void;
  onNotificationOpen?: (payload: PushNotificationOpenPayload) => void;
  /** Also register Expo token on merchant store endpoint (legacy fan-out). */
  registerStoreExpoToken?: (args: {
    storeId: number;
    expoPushToken: string;
    accessToken: string;
    platform: string;
  }) => Promise<void>;
  log?: (message: string, extra?: Record<string, unknown>) => void;
};
