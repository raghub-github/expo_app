"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Spinner = React.memo(function Spinner(props: { className?: string; label?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", props.className)} role="status" aria-label={props.label ?? "Loading"}>
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-teal-600" aria-hidden />
      {props.label ? <span className="text-sm text-slate-600">{props.label}</span> : null}
    </span>
  );
});

export const TreeRowSkeleton = React.memo(function TreeRowSkeleton(props: { depth?: number }) {
  const pad = Math.min((props.depth ?? 0) * 14, 100);
  return (
    <div className="flex items-center gap-3 py-2.5" style={{ paddingLeft: pad }}>
      <div className="h-4 w-4 shrink-0 rounded bg-slate-200/80 animate-pulse" />
      <div className="h-5 w-16 shrink-0 rounded-md bg-violet-100/80 animate-pulse" />
      <div className="h-4 flex-1 max-w-md rounded bg-slate-200/70 animate-pulse" />
      <div className="ml-auto flex gap-2">
        <div className="h-7 w-12 rounded-full bg-slate-200/80 animate-pulse" />
        <div className="h-7 w-12 rounded-full bg-slate-200/80 animate-pulse" />
        <div className="h-7 w-12 rounded-full bg-slate-200/80 animate-pulse" />
      </div>
    </div>
  );
});

export function TreeSkeletonBlock({ rows = 8, depth = 0 }: { rows?: number; depth?: number }) {
  return (
    <div className="divide-y divide-slate-100/80">
      {Array.from({ length: rows }, (_, i) => (
        <TreeRowSkeleton key={i} depth={depth} />
      ))}
    </div>
  );
}
