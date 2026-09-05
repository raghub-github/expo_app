export function applyLiveProgressFromPush(data: Record<string, unknown>): Promise<void>;
export function dismissStaleLiveOrderTrayNotifications(
  activeOrderIds: Set<string> | string[],
  opts?: { force?: boolean }
): Promise<void>;
export function isGmLiveProgressPush(data: Record<string, unknown>): boolean;
export function liveProgressHandlerResult(data: Record<string, unknown>): {
  suppress: boolean;
  shouldShowAlert: boolean;
  shouldPlaySound: boolean;
  shouldSetBadge: boolean;
  shouldShowBanner: boolean;
  shouldShowList: boolean;
};
export function postOrUpdateLiveNotification(args: {
  orderId: string;
  title: string;
  body: string;
  step: number;
  steps: number;
  terminal?: boolean;
  service?: string;
}): Promise<void>;
