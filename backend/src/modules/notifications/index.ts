/**
 * Notifications module — public surface.
 *
 * Controllers import from here:
 *   import { sendToUser, sendToTopic, send } from "../notifications";
 *
 * Never reach into the implementation files (notificationService.ts,
 * fcmProvider.ts, etc.) directly from outside this module.
 */
export {
  send,
  sendToUser,
  sendToUsers,
  sendToRole,
  sendToTopic,
  sendBroadcast,
  schedule,
  cancel,
  resendCampaign,
  loadTemplate,
  listTemplates,
  previewTemplate,
  renderTemplate,
  markClicked,
} from "./notificationService.js";

export { subscribeToTopic, unsubscribeFromTopic } from "./fcmProvider.js";

export { notificationRoutes } from "./notification.routes.js";
export { notificationInternalRoutes } from "./notification.internal.routes.js";
export { startScheduledPoller, stopScheduledPoller } from "./scheduledPoller.js";
export { emitEvent, registerDomainEventHandlers, type DomainEventMap } from "./eventBus.js";

export type {
  NotificationRole,
  NotificationChannel,
  NotificationPriority,
  NotificationPlatform,
  NotificationStatus,
  NotificationCategory,
  NotificationTemplate,
  TemplateVariables,
  TargetFilter,
  SendIntent,
  SendResult,
  Recipient,
  ProviderSendResult,
} from "./types.js";
