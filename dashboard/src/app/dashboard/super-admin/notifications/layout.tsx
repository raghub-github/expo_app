import type { ReactNode } from "react";

/**
 * Navigation for this module lives in the shared dashboard RightSidebar.
 * Keep this layout content-only so the page never gets a second left rail.
 */
export default function NotificationsLayout({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 min-w-0 bg-slate-50">{children}</div>;
}
