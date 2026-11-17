"use client";

import { useEffect, useState } from "react";

export type PreviewLayoutStyle = "default" | "banner_image" | "category_row" | "countdown";

export type PreviewCategoryChip = {
  categoryId: string;
  label: string;
  imageUrl: string;
  deepLink?: string;
};

type Props = {
  title: string;
  body: string;
  imageUrl?: string | null;
  ctaLabel?: string | null;
  countdownEnabled?: boolean;
  endsAt?: string | null;
  layoutStyle?: PreviewLayoutStyle;
  categoryChips?: PreviewCategoryChip[];
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

function parseEndsAtMs(endsAt: string): number {
  const raw = endsAt.trim();
  if (!raw) return NaN;
  // datetime-local → treat as local wall time
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(raw)) {
    const d = new Date(raw);
    return d.getTime();
  }
  return new Date(raw).getTime();
}

function LiveCountdown({ endsAt }: { endsAt: string }) {
  const [label, setLabel] = useState("00:00:00");
  useEffect(() => {
    const endMs = parseEndsAtMs(endsAt);
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
  return <span className="font-mono text-sm font-bold tabular-nums text-white">{label}</span>;
}

function TrayChrome({ children }: { children: React.ReactNode }) {
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
        {children}
      </div>
      <p className="mt-2 text-center text-[11px] text-slate-500">
        Android tray preview · iOS keeps standard image + text
      </p>
    </div>
  );
}

export function CustomerAnnouncementPreview({
  title,
  body,
  imageUrl,
  ctaLabel,
  countdownEnabled,
  endsAt,
  layoutStyle = "default",
  categoryChips = [],
}: Props) {
  const cta = (ctaLabel ?? "").trim();
  const hasImage = Boolean(imageUrl?.trim());
  const showCountdown = Boolean(countdownEnabled) || layoutStyle === "countdown";
  const chips = categoryChips.filter((c) => c.imageUrl && c.label).slice(0, 3);
  const style =
    layoutStyle !== "default"
      ? layoutStyle
      : chips.length >= 2
        ? "category_row"
        : showCountdown
          ? "countdown"
          : hasImage
            ? "banner_image"
            : "default";

  if (style === "banner_image" && hasImage) {
    return (
      <TrayChrome>
        <div className="relative mt-2 px-0 pb-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl!} alt="" className="h-44 w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3.5 pb-3.5 pt-10">
            <div className="text-[15px] font-bold leading-snug">
              {title.trim() || "Campaign title"}
            </div>
            <div className="mt-1 text-[13px] leading-snug text-slate-200">
              {body.trim() || "Campaign message"}
            </div>
          </div>
        </div>
      </TrayChrome>
    );
  }

  if (style === "category_row" && chips.length >= 2) {
    return (
      <TrayChrome>
        <div className="px-3.5 pt-3 pb-2">
          <div className="text-[15px] font-bold leading-snug">
            {title.trim() || "Campaign title"}
          </div>
          <div className="mt-1 text-[13px] leading-snug text-slate-300">
            {body.trim() || "Campaign message"}
          </div>
        </div>
        <div className="flex gap-2 px-3 pb-3.5">
          {chips.map((chip) => (
            <div key={chip.categoryId} className="min-w-0 flex-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={chip.imageUrl}
                alt=""
                className="aspect-[4/3] w-full rounded-xl object-cover"
              />
              <div className="mt-1 truncate text-center text-[11px] font-semibold text-slate-200">
                {chip.label}
              </div>
            </div>
          ))}
        </div>
      </TrayChrome>
    );
  }

  if (style === "countdown") {
    return (
      <TrayChrome>
        {/* Zomato-style: title/body left, live timer pill on the right — same row */}
        <div className="flex items-center gap-3 px-3.5 pb-3.5 pt-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-snug">
              {title.trim() || "Campaign title"}
            </div>
            <div className="mt-0.5 text-[13px] leading-snug text-slate-300">
              {body.trim() || "Campaign message"}
            </div>
          </div>
          <div className="shrink-0 rounded-full bg-black px-3 py-1.5">
            {endsAt ? (
              <LiveCountdown endsAt={endsAt} />
            ) : (
              <span className="font-mono text-sm font-bold tabular-nums text-white">00:00:00</span>
            )}
          </div>
        </div>
        {hasImage ? (
          <div className="px-3 pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl!} alt="" className="h-32 w-full rounded-2xl object-cover" />
          </div>
        ) : null}
        {cta ? (
          <div className="px-3 pb-3.5">
            <div className="flex min-w-0 items-center justify-between rounded-full bg-teal-500 px-4 py-2.5 text-[13px] font-bold text-[#042f2e]">
              <span className="truncate">{cta}</span>
              <span aria-hidden>›</span>
            </div>
          </div>
        ) : null}
      </TrayChrome>
    );
  }

  // Any countdown → Zomato row (copy left, live pill right), never a bottom "Offer valid for" row.
  if (showCountdown) {
    return (
      <TrayChrome>
        <div className="flex items-center gap-3 px-3.5 pb-3.5 pt-3">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-bold leading-snug">
              {title.trim() || "Campaign title"}
            </div>
            <div className="mt-0.5 text-[13px] leading-snug text-slate-300">
              {body.trim() || "Campaign message"}
            </div>
          </div>
          <div className="shrink-0 rounded-full bg-black px-3 py-1.5">
            {endsAt ? (
              <LiveCountdown endsAt={endsAt} />
            ) : (
              <span className="font-mono text-sm font-bold tabular-nums text-white">00:00:00</span>
            )}
          </div>
        </div>
        {hasImage ? (
          <div className="px-3 pb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl!} alt="" className="h-36 w-full rounded-2xl object-cover" />
          </div>
        ) : null}
        {cta ? (
          <div className="px-3 pb-3.5">
            <div className="flex min-w-0 items-center justify-between rounded-full bg-teal-500 px-4 py-2.5 text-[13px] font-bold text-[#042f2e]">
              <span className="truncate">{cta}</span>
              <span aria-hidden>›</span>
            </div>
          </div>
        ) : null}
      </TrayChrome>
    );
  }

  const plain = !cta && !hasImage;
  return (
    <TrayChrome>
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
          <img src={imageUrl!} alt="" className="h-36 w-full rounded-2xl object-cover" />
        </div>
      ) : null}
      {cta ? (
        <div className="px-3 pb-3.5 pt-1">
          <div className="flex min-w-0 items-center justify-between rounded-full bg-teal-500 px-4 py-2.5 text-[13px] font-bold text-[#042f2e]">
            <span className="truncate">{cta}</span>
            <span aria-hidden>›</span>
          </div>
        </div>
      ) : plain ? (
        <div className="px-3.5 pb-3 text-[11px] text-slate-500">
          Plain notification · tap opens target
        </div>
      ) : null}
    </TrayChrome>
  );
}
