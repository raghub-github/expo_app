'use client';

import React from 'react';
import { Check } from 'lucide-react';
import {
  formatTimelineClock,
  formatTimelineDate,
  type MerchantVisibleTimelineStep,
} from '@/lib/merchantVisibleTimeline';

export function MerchantOrderTimelineStrip({
  steps,
  onView,
}: {
  steps: MerchantVisibleTimelineStep[];
  onView: (action: 'accepted' | 'ready') => void;
}) {
  return (
    <div className="w-full min-w-0 overflow-hidden py-1">
      <div className="flex w-full items-start">
        {steps.map((step, i) => {
          const prevDone = i > 0 && steps[i - 1].completed;
          const lineDone = prevDone && step.completed;
          return (
            <div key={step.key} className="flex flex-1 min-w-0 flex-col items-center">
              <div className="flex w-full items-center">
                {i > 0 ? (
                  <div
                    className={`flex-1 h-0.5 min-w-[2px] ${lineDone ? 'bg-green-500' : 'bg-gray-200'}`}
                    aria-hidden
                  />
                ) : (
                  <div className="flex-1" aria-hidden />
                )}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-[1] ${
                    step.completed ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {step.completed ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : (
                    <span className="text-[10px] font-bold">{i + 1}</span>
                  )}
                </div>
                {i < steps.length - 1 ? (
                  <div
                    className={`flex-1 h-0.5 min-w-[2px] ${step.completed && steps[i + 1]?.completed ? 'bg-green-500' : 'bg-gray-200'}`}
                    aria-hidden
                  />
                ) : (
                  <div className="flex-1" aria-hidden />
                )}
              </div>

              <p
                className={`mt-2 w-full px-0.5 text-center text-[11px] font-medium leading-snug break-words hyphens-auto ${
                  step.completed ? 'text-gray-700' : 'text-gray-400'
                }`}
              >
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
              ) : (
                <p className="mt-0.5 text-xs text-gray-300">—</p>
              )}

              {step.showView && step.completed && step.at && step.actorAction ? (
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
