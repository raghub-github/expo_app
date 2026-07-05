/**
 * Scheduled campaign poller — runs inside the backend Fastify process.
 *
 * Every N seconds (default 30, configurable via notification_settings):
 *   1. Lock + claim due campaigns (status='scheduled' AND scheduled_at<=now())
 *   2. Send each one via NotificationService.send()
 *   3. Mark complete
 *
 * Uses Redis withLock so only ONE backend instance polls at a time.
 */
import { withLock } from "@gatimitra/redis";
import { loadDueScheduledCampaigns, recoverStaleRunningCampaigns, updateCampaignCounts, finalizeCampaignSend, readSetting } from "./db.js";
import { send } from "./notificationService.js";
import type { TargetFilter, TemplateVariables } from "./types.js";

const LOCK_KEY = "tick:notification-scheduler";
const LOCK_TTL_MS = 25_000;
let timer: NodeJS.Timeout | null = null;

async function pollOnce(): Promise<void> {
  await withLock(LOCK_KEY, LOCK_TTL_MS, async () => {
    const recovered = await recoverStaleRunningCampaigns();
    if (recovered > 0) {
      console.info(`[notifications] recovered ${recovered} stale running campaign(s)`);
    }

    const due = await loadDueScheduledCampaigns(50);
    if (due.length === 0) return;

    for (const campaign of due) {
      if (!campaign.template_code) {
        await updateCampaignCounts(campaign.id, { status: "failed", finishedAt: new Date().toISOString() });
        continue;
      }
      try {
        const target = campaign.target_filter as unknown as TargetFilter;
        const vars = campaign.variables as TemplateVariables;
        const result = await send({
          templateCode: campaign.template_code,
          variables: vars,
          target,
          campaignId: campaign.id,
        });
        await finalizeCampaignSend(campaign.id, "completed");
        if (result.queued === 0 && result.failedSync === 0 && result.skipped === 0) {
          console.info(`[notifications] scheduled campaign cid=${campaign.id} completed with 0 recipients`);
        }
      } catch (e) {
        console.error(`[notifications] scheduled send failed cid=${campaign.id}`, (e as Error).message);
        await finalizeCampaignSend(campaign.id, "failed");
      }
    }
  });
}

export async function startScheduledPoller(): Promise<void> {
  if (timer) return;
  const intervalSec = (await readSetting<number>("scheduled_poll_interval_sec")) ?? 30;
  const ms = Math.max(10, Math.min(300, intervalSec)) * 1000;

  // Fire once on start so freshly-scheduled campaigns don't wait a full interval.
  void pollOnce().catch((e) => console.warn("[notifications] initial poll error", (e as Error).message));

  timer = setInterval(() => {
    void pollOnce().catch((e) => console.warn("[notifications] poll error", (e as Error).message));
  }, ms);
  if (timer.unref) timer.unref();
}

export function stopScheduledPoller(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
