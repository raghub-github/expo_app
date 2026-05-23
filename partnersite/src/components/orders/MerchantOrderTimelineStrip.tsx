'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import {
  formatTimelineClock,
  formatTimelineDate,
  type MerchantVisibleTimelineStep,
} from '@/lib/merchantVisibleTimeline';

function stepCircleClass(step: MerchantVisibleTimelineStep): string {
  if (step.tone === 'cancel') return 'bg-red-500 text-white';
  if (step.tone === 'rto') return 'bg-amber-500 text-white';
  return 'bg-green-500 text-white';
}

function connectorClass(done: boolean): string {
  return done ? 'bg-green-500' : 'bg-gray-200';
}

export function MerchantOrderTimelineStrip({
  steps,
  onView,
}: {
  steps: MerchantVisibleTimelineStep[];
  onView: (action: 'accepted' | 'ready' | 'cancelled') => void;
}) {
  if (steps.length === 0) {
    return <p className="text-sm text-gray-500 text-center py-6">No timeline events recorded yet.</p>;
  }

  return (
    <div className="w-full min-w-0 overflow-x-auto py-1">
      <div className="flex w-full min-w-min items-start px-1">
        {steps.map((step, i) => {
          const isCancel = step.tone === 'cancel';
          const prevDone = i > 0;
          const lineDone = prevDone && step.completed;
          const circleClass = stepCircleClass(step);

          return (
            <div
              key={step.key}
              className="flex flex-col items-center shrink-0"
              style={{ minWidth: step.key === 'rider_arrived' ? 112 : 88, maxWidth: 140 }}
            >
              <div className="flex w-full items-center">
                {i > 0 ? (
                  <div
                    className={`flex-1 h-0.5 min-w-[8px] ${isCancel ? 'bg-red-300' : connectorClass(lineDone)}`}
                    aria-hidden
                  />
                ) : (
                  <div className="flex-1 min-w-[4px]" aria-hidden />
                )}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-[1] ${circleClass}`}
                >
                  {isCancel ? (
                    <X className="w-4 h-4" strokeWidth={3} />
                  ) : (
                    <Check className="w-4 h-4" strokeWidth={3} />
                  )}
                </div>
                {i < steps.length - 1 ? (
                  <div
                    className={`flex-1 h-0.5 min-w-[8px] ${
                      isCancel ? 'bg-gray-200' : connectorClass(step.completed)
                    }`}
                    aria-hidden
                  />
                ) : (
                  <div className="flex-1 min-w-[4px]" aria-hidden />
                )}
              </div>

              <p className="mt-2 w-full px-0.5 text-center text-[11px] font-semibold leading-snug text-gray-800 break-words">
                {step.label}
              </p>

              {step.at ? (
                <div className="mt-0.5 text-center leading-tight">
                  <p className="text-[10px] font-medium text-gray-600 tabular-nums">
                    {formatTimelineDate(step.at)}
                  </p>
                  <p className="text-xs font-semibold text-gray-900 tabular-nums">
                    {formatTimelineClock(step.at)}
                  </p>
                </div>
              ) : null}

              {step.detail ? (
                <p className="mt-0.5 text-[10px] text-gray-500 text-center line-clamp-2 px-0.5" title={step.detail}>
                  {step.detail}
                </p>
              ) : null}

              {step.showView && step.at && step.actorAction ? (
                <button
                  type="button"
                  className="mt-0.5 text-xs font-medium text-blue-600 hover:underline"
                  onClick={() => onView(step.actorAction!)}
                >
                  View
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
