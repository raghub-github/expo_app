"use client";

import React, { useState, ReactNode } from "react";
import { UtensilsCrossed, Layers, Package } from "lucide-react";

type Tab = "items" | "addons" | "combos";

export function StoreMenuTabs({
  storeId,
  children,
}: {
  storeId: string;
  children: [ReactNode, ReactNode, ReactNode];
}) {
  const [tab, setTab] = useState<Tab>("items");
  const tabs: { key: Tab; label: string; icon: ReactNode }[] = [
    { key: "items", label: "Menu Items", icon: <UtensilsCrossed size={18} /> },
    { key: "addons", label: "Addon Library", icon: <Layers size={18} /> },
    { key: "combos", label: "Combos", icon: <Package size={18} /> },
  ];
  const menuItemsChild = React.isValidElement(children[0])
    ? React.cloneElement(children[0] as React.ReactElement<{ onSwitchToAddonLibrary?: () => void }>, {
        onSwitchToAddonLibrary: () => setTab("addons"),
      })
    : children[0];
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 flex border-b border-gray-200 bg-white">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === t.key
                ? "border-orange-500 text-orange-600 bg-orange-50/50"
                : "border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === "items" && menuItemsChild}
        {tab === "addons" && children[1]}
        {tab === "combos" && children[2]}
      </div>
    </div>
  );
}
