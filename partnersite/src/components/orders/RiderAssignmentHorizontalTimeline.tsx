'use client';

import { Check, Minus, X } from 'lucide-react';

/** Subset of riders-log row needed for the horizontal timeline. */
export type RiderTimelineSource = {
  assignment_status: string;
  assigned_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  reached_merchant_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  unassigned_at?: string | null;
};

type StepTone = 'done' | 'missed' | 'cancel' | 'pending';

type RiderTimelineStep = {
  key: string;
  label: string;
  at: string | null;
  tone: StepTone;
};

function isInactiveRiderAssignment(r: RiderTimelineSource): boolean {
  if ((r.cancelled_at ?? '').trim() || (r.rejected_at ?? '').trim() || (r.unassigned_at ?? '').trim()) {
    return true;
  }
  const st = (r.assignment_status ?? '').toUpperCase();
  return st === 'CANCELLED' || st === 'REJECTED' || st === 'UNASSIGNED';
}

function formatTimelineClock(s: string | null | undefined): string {
  if (!s?.trim()) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(d);
  } catch {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
}

function buildRiderTimelineSteps(rider: RiderTimelineSource): RiderTimelineStep[] {
  const inactive = isInactiveRiderAssignment(rider);
  const endAt = rider.cancelled_at ?? rider.unassigned_at ?? rider.rejected_at ?? null;
  const delivered = !!rider.delivered_at;

  const assignedAt = rider.assigned_at ?? rider.accepted_at;
  const reachedAt = rider.reached_merchant_at;
  const pickedAt = rider.picked_up_at;

  const reachedDone = !!reachedAt;
  const pickedDone = !!pickedAt;
  const settled = inactive || delivered;

  let final: RiderTimelineStep;
  if (delivered) {
    final = {
      key: 'delivered',
      label: 'Delivered',
      at: rider.delivered_at,
      tone: 'done',
    };
  } else if (inactive || endAt) {
    final = {
      key: 'cancelled',
      label: 'Cancelled',
      at: endAt,
      tone: 'cancel',
    };
  } else {
    final = {
      key: 'outcome',
      label: 'Outcome',
      at: null,
      tone: 'pending',
    };
  }

  return [
    {
      key: 'assigned',
      label: 'Assigned',
      at: assignedAt,
      tone: assignedAt ? 'done' : 'pending',
    },
    {
      key: 'reached',
      label: reachedDone ? 'Reached' : 'Not reached',
      at: reachedAt,
      tone: reachedDone ? 'done' : settled ? 'missed' : 'pending',
    },
    {
      key: 'picked',
      label: pickedDone ? 'Picked' : 'Not picked',
      at: pickedAt,
      tone: pickedDone ? 'done' : settled ? 'missed' : 'pending',
    },
    final,
  ];
}

function stepColors(tone: StepTone): { dot: string; icon: string; label: string } {
  switch (tone) {
    case 'done':
      return { dot: 'bg-green-500', icon: 'text-white', label: 'text-gray-900' };
    case 'cancel':
      return { dot: 'bg-red-500', icon: 'text-white', label: 'text-red-700' };
    case 'missed':
      return { dot: 'bg-gray-200', icon: 'text-gray-400', label: 'text-gray-400' };
    default:
      return { dot: 'bg-gray-100', icon: 'text-gray-300', label: 'text-gray-400' };
  }
}

function railClass(from: StepTone, to: StepTone): string {
  if (from === 'done' && (to === 'done' || to === 'cancel' || to === 'missed')) {
    return 'bg-green-500';
  }
  return 'bg-gray-200';
}

function StepIcon({ tone }: { tone: StepTone }) {
  const colors = stepColors(tone);
  if (tone === 'cancel') return <X size={11} strokeWidth={3} className={colors.icon} aria-hidden />;
  if (tone === 'done') return <Check size={11} strokeWidth={3} className={colors.icon} aria-hidden />;
  if (tone === 'missed') return <Minus size={11} strokeWidth={3} className={colors.icon} aria-hidden />;
  return <span className="h-1.5 w-1.5 rounded-full border-[1.5px] border-gray-300" aria-hidden />;
}

type Props = {
  rider: RiderTimelineSource;
};

/** Merchant-app parity: Assigned → Reached → Picked → Delivered/Cancelled. */
export function RiderAssignmentHorizontalTimeline({ rider }: Props) {
  const steps = buildRiderTimelineSteps(rider);

  return (
    <div className="mt-3 border-t border-gray-200 pt-2.5">
      <div className="flex items-start">
        {steps.map((step, index) => {
          const colors = stepColors(step.tone);
          const prev = index > 0 ? steps[index - 1] : null;
          const next = index < steps.length - 1 ? steps[index + 1] : null;
          const clock = step.at ? formatTimelineClock(step.at) : '';

          return (
            <div key={step.key} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="mb-1.5 flex w-full items-center">
                <div
                  className={`h-0.5 flex-1 ${prev ? railClass(prev.tone, step.tone) : 'bg-transparent'}`}
                />
                <div
                  className={`z-[1] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${colors.dot}`}
                >
                  <StepIcon tone={step.tone} />
                </div>
                <div
                  className={`h-0.5 flex-1 ${next ? railClass(step.tone, next.tone) : 'bg-transparent'}`}
                />
              </div>
              <p
                className={`px-0.5 text-center text-[11px] font-bold leading-tight ${colors.label}`}
              >
                {step.label}
              </p>
              <p
                className={`mt-0.5 text-center text-[11px] tabular-nums ${
                  clock ? 'font-semibold text-gray-600' : 'font-medium text-gray-400'
                }`}
              >
                {clock || '—'}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
