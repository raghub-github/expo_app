"use client";

import { useEffect, useState } from "react";

type Props = {
  title: string;
  body: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  countdownEnabled?: boolean;
  endsAt?: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function LiveCountdown({ endsAt }: { endsAt: string }) {
  const [label, setLabel] = useState("00:00:00");
  useEffect(() => {
    const endMs = new Date(endsAt).getTime();
    if (!Number.isFinite(endMs)) {
      setLabel("00:00:00");
      return;
    }
    const tick = () => {
      setLabel(formatRemaining(endMs - Date.now()));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);
  return <span className="font-mono text-sm font-bold tabular-nums text-teal-300">{label}</span>;
}

export function CustomerAnnouncementPreview({
  title,
  body,
  imageUrl,
  ctaLabel,
  countdownEnabled,
  endsAt,
}: Props) {
  const cta = (ctaLabel ?? "").trim();
  const hasImage = Boolean(imageUrl?.trim());
  const showCountdown = Boolean(countdownEnabled);
  const plain = !cta && !hasImage && !showCountdown;

  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="overflow-hidden rounded-[22px] border border-slate-800 bg-[#121212] text-white shadow-xl">
        <div className="flex items-center justify-between px-3.5 pt-3">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/onlylogo.png"
              alt=""
              className="size-7 rounded-full bg-teal-500 object-contain p-0.5"
            />
            <div className="text-[13px] font-semibold tracking-tight">
              GatiMitra
              <span className="ml-1.5 font-normal text-slate-400">· now</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-lg leading-none">⋮</span>
            <span className="text-lg leading-none">×</span>
          </div>
        </div>

        <div className={`px-3.5 pt-3 ${plain ? "pb-4" : "pb-2"}`}>
          <div className="text-[15px] font-bold leading-snug">
            {title.trim() || "Campaign title"}
          </div>
          <div className="mt-1 text-[13px] leading-snug text-slate-300">
            {body.trim() || "Campaign message"}
          </div>
        </div>

        {hasImage ? (
          <div className="px-3 pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl!}
              alt=""
              className="h-36 w-full rounded-2xl object-cover"
            />
          </div>
        ) : null}

        {!plain ? (
          <div className="flex items-center gap-2 px-3 pb-3.5 pt-1">
            {cta ? (
              <div className="flex min-w-0 flex-1 items-center justify-between rounded-full bg-teal-500 px-4 py-2.5 text-[13px] font-bold text-[#042f2e]">
                <span className="truncate">{cta}</span>
                <span aria-hidden>›</span>
              </div>
            ) : null}
            {showCountdown ? (
              <div
                className={
                  "flex items-center gap-2 rounded-full bg-slate-900/80 px-3 py-2 ring-1 ring-slate-700 " +
                  (cta ? "shrink-0" : "flex-1")
                }
              >
                <span className="flex size-6 items-center justify-center rounded-full bg-teal-500/20 text-xs text-teal-300">
                  ⏱
                </span>
                <div className="min-w-0">
                  <div className="text-[10px] leading-none text-slate-400">Offer valid for</div>
                  {endsAt ? (
                    <LiveCountdown endsAt={endsAt} />
                  ) : (
                    <div className="font-mono text-sm font-bold text-teal-300">00:00:00</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="px-3.5 pb-3 text-[11px] text-slate-500">Plain notification · tap opens target</div>
        )}
      </div>
    </div>
  );
}
