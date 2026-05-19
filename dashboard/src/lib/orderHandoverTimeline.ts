/** Live + completed durations for ready → handover → rider pickup. */

export function formatHandoverDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} mins`;
}

export type HandoverTimelinePhase = 'waiting_handover' | 'waiting_pickup' | 'complete';

export function resolveHandoverTimelinePhase(
  preparedAt: string | null | undefined,
  handedOverAt: string | null | undefined,
  riderPickedUpAt: string | null | undefined
): HandoverTimelinePhase {
  if (!preparedAt) return 'waiting_handover';
  if (!handedOverAt) return 'waiting_handover';
  if (!riderPickedUpAt) return 'waiting_pickup';
  return 'complete';
}

export function elapsedMs(fromIso: string, toMs: number): number {
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, toMs - from);
}
