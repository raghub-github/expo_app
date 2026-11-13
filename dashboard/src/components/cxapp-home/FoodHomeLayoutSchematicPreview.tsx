"use client";

import type { FoodHomeLayoutKey } from "@/lib/cxapp-home/food-home-layout";
import { cn } from "@/lib/utils";

type Props = {
  layoutKey: FoodHomeLayoutKey;
  subscriptionRowEnabled?: boolean;
  under250Enabled?: boolean;
};

/**
 * Static schematic phone mock for layout selection.
 * Intentionally does NOT fetch or mirror live customer-app data.
 */
export function FoodHomeLayoutSchematicPreview({
  layoutKey,
  subscriptionRowEnabled = false,
  under250Enabled = false,
}: Props) {
  const dark = layoutKey === "discovery";

  return (
    <div className="mb-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-center text-sm font-semibold text-slate-700">Layout preview</p>
      <p className="mt-0.5 text-center text-[10px] text-slate-500">
        Schematic only — not a live customer app screen
      </p>

      <div className="mx-auto mt-3 w-full max-w-[248px]">
        <div className="rounded-[26px] border-[5px] border-slate-900 bg-slate-900 p-1 shadow-lg">
          <div
            className={cn(
              "overflow-hidden rounded-[20px]",
              dark ? "bg-[#121212]" : "bg-[#F5F7FA]"
            )}
          >
            <div
              className={cn(
                "flex items-center justify-between px-3 pb-1 pt-1.5",
                layoutKey === "grid_first"
                  ? "bg-[#7DD3FC]"
                  : dark
                    ? "bg-[#121212]"
                    : "bg-white"
              )}
            >
              <span
                className={cn(
                  "text-[9px] font-semibold",
                  dark ? "text-white" : "text-slate-800"
                )}
              >
                9:41
              </span>
              <div className="h-3.5 w-14 rounded-full bg-slate-900/90" />
              <div className="flex gap-0.5">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-sm",
                    dark ? "bg-white/70" : "bg-slate-700"
                  )}
                />
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-sm",
                    dark ? "bg-white/70" : "bg-slate-700"
                  )}
                />
              </div>
            </div>

            <div className="max-h-[min(420px,calc(100dvh-16rem))] space-y-2 overflow-hidden p-2.5">
              {layoutKey === "grid_first" ? (
                <GridFirstSchematic
                  subscriptionRowEnabled={subscriptionRowEnabled}
                  under250Enabled={under250Enabled}
                />
              ) : layoutKey === "discovery" ? (
                <DiscoverySchematic />
              ) : (
                <ClassicSchematic under250Enabled={under250Enabled} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassicSchematic({ under250Enabled }: { under250Enabled: boolean }) {
  return (
    <>
      <div className="h-7 rounded-lg bg-white ring-1 ring-slate-200" />
      <div className="h-16 rounded-xl bg-slate-200/90" />
      <div className="flex gap-1.5 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1">
            <div className="h-8 w-8 rounded-full bg-white ring-1 ring-slate-200" />
            <div className="h-1.5 w-8 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      {under250Enabled ? (
        <div className="flex gap-1">
          <div className="h-5 w-12 rounded-full bg-emerald-100 ring-1 ring-emerald-200" />
          <div className="h-5 w-14 rounded-full bg-white ring-1 ring-slate-200" />
        </div>
      ) : null}
      <div className="space-y-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-white ring-1 ring-slate-200" />
        ))}
      </div>
    </>
  );
}

function GridFirstSchematic({
  subscriptionRowEnabled,
  under250Enabled,
}: {
  subscriptionRowEnabled: boolean;
  under250Enabled: boolean;
}) {
  return (
    <>
      <div
        className="h-14 rounded-xl"
        style={{ background: "linear-gradient(180deg, #BAE6FD 0%, #BBF7D0 100%)" }}
      />
      {subscriptionRowEnabled ? (
        <div className="h-5 rounded bg-amber-100 ring-1 ring-amber-200" />
      ) : null}
      <div className="flex gap-1.5 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-1">
            <div className="h-7 w-7 rounded-full bg-white ring-1 ring-slate-200" />
            <div className="h-1.5 w-7 rounded bg-slate-200" />
            {i === 0 ? <div className="h-0.5 w-6 rounded bg-rose-400" /> : null}
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        <div className="h-5 w-12 rounded bg-white ring-1 ring-slate-200" />
        {under250Enabled ? (
          <div className="h-5 w-14 rounded bg-emerald-100 ring-1 ring-emerald-200" />
        ) : null}
        <div className="h-5 w-16 rounded bg-white ring-1 ring-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg bg-white ring-1 ring-slate-200" />
        ))}
      </div>
    </>
  );
}

function DiscoverySchematic() {
  return (
    <>
      <div className="h-7 rounded-full bg-zinc-800" />
      <div className="flex gap-1.5 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-12 flex-1 rounded-xl bg-zinc-900 ring-1",
              i === 0 ? "ring-teal-400/70" : i === 1 ? "ring-orange-400/70" : "ring-amber-400/70"
            )}
          />
        ))}
      </div>
      <div className="flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className="h-7 w-7 rounded-full bg-zinc-700" />
              <div className="h-1.5 w-7 rounded bg-zinc-700" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="h-7 w-7 rounded-full bg-zinc-700" />
              <div className="h-1.5 w-7 rounded bg-zinc-700" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-20 rounded-xl bg-zinc-900" />
      <div className="h-12 rounded-xl bg-zinc-900" />
    </>
  );
}
