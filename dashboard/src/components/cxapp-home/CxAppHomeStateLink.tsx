"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useCurrentRoute } from "@/context/CurrentRouteContext";
import { prefetchDashboardSection } from "@/lib/dashboard-prefetch";

export function cxAppHomeStateHref(stateId: string): string {
  return `/dashboard/super-admin/cxapp-home/${stateId}`;
}

type Props = {
  stateId: string;
  name: string;
};

export function CxAppHomeStateLink({ stateId, name }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentRoute = useCurrentRoute();
  const href = cxAppHomeStateHref(stateId);

  const warmRoute = useCallback(() => {
    router.prefetch(href);
    prefetchDashboardSection(queryClient, href);
  }, [href, queryClient, router]);

  const onNavigate = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      currentRoute?.startNavigation(href);
      warmRoute();
    },
    [currentRoute, href, warmRoute]
  );

  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      onClick={onNavigate}
      onPointerEnter={warmRoute}
      onFocus={warmRoute}
      className="group flex min-h-[40px] items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2 text-slate-800 transition hover:border-cyan-300 hover:bg-cyan-50/40 active:bg-cyan-50/70"
    >
      <span className="truncate text-[13px] font-semibold">{name}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-cyan-700" />
    </Link>
  );
}
