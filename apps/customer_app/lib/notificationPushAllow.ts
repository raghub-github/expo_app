/**
 * Bridge: PushNotificationBootstrap registers the Allow handler;
 * CustomerPermissionSheetsHost invokes it without owning the push controller.
 */
type AllowHandler = () => Promise<boolean>;

let allowHandler: AllowHandler | null = null;

export function setNotificationPushAllowHandler(handler: AllowHandler | null): void {
  allowHandler = handler;
}

export async function runNotificationPushAllow(): Promise<boolean> {
  if (!allowHandler) return false;
  try {
    return await allowHandler();
  } catch {
    return false;
  }
}
