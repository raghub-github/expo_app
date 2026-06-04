/**
 * @gatimitra/queue — BullMQ producer + worker abstractions.
 *
 *   // Producer (backend route handlers)
 *   import { enqueue, QUEUE_NAMES } from "@gatimitra/queue";
 *   await enqueue(QUEUE_NAMES.PUSH_SEND, { to, title, body });
 *
 *   // Worker (services/notification-worker/index.ts)
 *   import { runWorker, attachLifecycleHandlers, QUEUE_NAMES } from "@gatimitra/queue";
 *   runWorker(QUEUE_NAMES.PUSH_SEND, async (job) => { ... });
 *   await attachLifecycleHandlers();
 */
export { enqueue, scheduleRepeating, closeAllQueues, QUEUE_NAMES } from "./producer.js";
export { runWorker, gracefulShutdownAllWorkers, attachLifecycleHandlers } from "./worker.js";
//# sourceMappingURL=index.js.map