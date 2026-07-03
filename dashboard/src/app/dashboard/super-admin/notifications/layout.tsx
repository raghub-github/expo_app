"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  CalendarClock,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Settings as SettingsIcon,
  Smartphone,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type Item = { href: string; label: string; Icon: ComponentType<{ className?: string }> };

const ITEMS: Item[] = [
  { href: "/dashboard/super-admin/notifications", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/dashboard/super-admin/notifications/templates", label: "Templates", Icon: FileText },
  { href: "/dashboard/super-admin/notifications/campaigns", label: "Campaigns", Icon: Megaphone },
  { href: "/dashboard/super-admin/notifications/scheduled", label: "Scheduled", Icon: CalendarClock },
  { href: "/dashboard/super-admin/notifications/history", label: "History", Icon: History },
  { href: "/dashboard/super-admin/notifications/analytics", label: "Analytics", Icon: BarChart3 },
  { href: "/dashboard/super-admin/notifications/devices", label: "Devices", Icon: Smartphone },
  { href: "/dashboard/super-admin/notifications/logs", label: "Logs / Failures", Icon: ListChecks },
  { href: "/dashboard/super-admin/notifications/settings", label: "Settings", Icon: SettingsIcon },
];

export default function NotificationsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full min-h-[calc(100vh-4rem)] bg-slate-50">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white py-4">
        <div className="mb-4 px-4">
          <Link href="/dashboard/super-admin" className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-700">
            ← Super Admin
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-teal-600 text-white">
              <Bell className="h-4 w-4" />
            </span>
            <div className="text-sm font-semibold text-slate-900">Notifications</div>
          </div>
        </div>
        <nav className="space-y-0.5 px-2">
          {ITEMS.map(({ href, label, Icon }) => {
            const active =
              pathname === href ||
              (href !== "/dashboard/super-admin/notifications" &&
                pathname != null &&
                pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition-colors " +
                  (active
                    ? "bg-teal-50 font-semibold text-teal-700"
                    : "text-slate-700 hover:bg-slate-100")
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="min-h-full flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
