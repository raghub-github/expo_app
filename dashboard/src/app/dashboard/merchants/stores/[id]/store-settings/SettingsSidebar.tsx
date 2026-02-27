"use client";

import {
  Crown,
  Clock,
  Power,
  ChefHat,
  Package,
  Users,
  Smartphone,
} from "lucide-react";

export const SETTINGS_TABS = [
  { id: "plans", label: "Plans & Subscription", icon: Crown },
  { id: "timings", label: "Outlet Timings", icon: Clock },
  { id: "operations", label: "Store Operations", icon: Power },
  { id: "menu-capacity", label: "Menu & Capacity", icon: ChefHat },
  { id: "delivery", label: "Delivery Settings", icon: Package },
  { id: "riders", label: "Self-Delivery Riders", icon: Users },
  { id: "pos", label: "POS Integration", icon: Smartphone },
] as const;

export type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"];

/**
 * Horizontal settings navbar — white inactive buttons, dark active button.
 * Section bg light; active tab dark with white text.
 */
export function SettingsNavBar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <nav className="w-full shrink-0 bg-gray-200 pt-2 px-2 pb-0 border-b border-gray-300">
      <div className="flex overflow-x-auto scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent gap-1 min-w-0">
        {SETTINGS_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              style={{ cursor: "pointer" }}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all whitespace-nowrap rounded-t-lg min-h-[40px] ${
                isActive
                  ? "bg-gray-800 text-white shadow-md border-b-2 border-b-gray-800 -mb-px relative z-10"
                  : "bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 hover:border-gray-400"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-current" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
