"use client";

import { useCallback, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import {
  cleanDashboardHref,
  isDashboardNavAlreadyAtTarget,
  shouldShowDashboardNavOverlay,
} from "@/lib/navigation/dashboard-nav-transition";

type Props = {
  href: string;
  ariaLabel?: string;
  title?: string;
  className?: string;
  /** When set, the header reads as "← {label}" and the whole control is the back link. */
  label?: string;
};

const ICON_CLASS =
  "inline-flex shrink-0 cursor-pointer items-center rounded-md p-1.5 text-gray-600 transition hover:bg-gray-100";

const LABELED_CLASS =
  "inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-md py-0.5 pr-2 text-gray-900 transition hover:bg-gray-100";

function livePath(): string {
  if (typeof window === "undefined") return "";
  return cleanDashboardHref(window.location.pathname);
}

/**
 * One-click header back. Next.js <Link> owns navigation — never preventDefault on a
 * real route change. Calling startNavigation in the same click re-renders the tree and
 * drops the first Link click (same bug as store-tab nav in RightSidebar).
 */
export function HeaderBackButton({
  href,
  ariaLabel = "Back",
  title = "Back",
  className,
  label,
}: Props) {
  const pathname = useAppPathname();
  const currentRoute = useCurrentRoute();
  const target = cleanDashboardHref(href);

  const onBack = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const current = livePath() || cleanDashboardHref(pathname);
      if (isDashboardNavAlreadyAtTarget(current, target)) {
        e.preventDefault();
        return;
      }
      // Overlay-off routes (Super Admin hub ↔ inner pages): skip startNavigation so
      // the layout does not re-render and swallow this click.
      if (shouldShowDashboardNavOverlay(current, target)) {
        window.setTimeout(() => {
          currentRoute?.startNavigation(target);
        }, 0);
      }
    },
    [currentRoute, pathname, target]
  );

  return (
    <Link
      href={href}
      onClick={onBack}
      className={className ?? (label ? LABELED_CLASS : ICON_CLASS)}
      aria-label={ariaLabel}
      title={title}
    >
      <ArrowLeft className="h-4 w-4 shrink-0 text-gray-600" />
      {label ? (
        <span className="min-w-0 truncate text-base font-semibold sm:text-lg">{label}</span>
      ) : null}
    </Link>
  );
}
