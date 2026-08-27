"use client";

import { useCallback, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import {
  cleanDashboardHref,
  isDashboardNavAlreadyAtTarget,
} from "@/lib/navigation/dashboard-nav-transition";

type Props = {
  href: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
};

const DEFAULT_CLASS =
  "shrink-0 cursor-pointer rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100";

/**
 * One-click header back — explicit router.push (Next.js Link can need a second
 * click on nested client layouts / soft-nav).
 */
export function HeaderBackButton({
  href,
  ariaLabel = "Back",
  title = "Back",
  className = DEFAULT_CLASS,
}: Props) {
  const router = useRouter();
  const pathname = useAppPathname();
  const currentRoute = useCurrentRoute();
  const target = cleanDashboardHref(href);

  const onBack = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const current = cleanDashboardHref(pathname);
      if (isDashboardNavAlreadyAtTarget(current, target)) return;
      currentRoute?.startNavigation(target);
      router.push(target);
    },
    [currentRoute, pathname, router, target]
  );

  return (
    <button type="button" onClick={onBack} className={className} aria-label={ariaLabel} title={title}>
      <ArrowLeft className="h-4 w-4" />
    </button>
  );
}
