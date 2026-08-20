"use client";

import React, { useState, ReactNode } from "react";
import { UtensilsCrossed, Layers, Package } from "lucide-react";
import { MenuPageChromeProvider, useMenuPageChrome } from "./menu-page-chrome-context";

type Tab = "items" | "addons" | "combos";

function StoreMenuTabsInner({
  storeId: _storeId,
  children,
}: {
  storeId: string;
  children: [ReactNode, ReactNode, ReactNode];
}) {
  const { itemsToolbar } = useMenuPageChrome();
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
      <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-gray-200 bg-white min-h-[48px]">
        <div className="flex items-center min-w-0 flex-shrink-0">
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
        {tab === "items" && itemsToolbar ? (
          <div className="flex flex-1 min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 px-2 sm:px-3 py-1.5 ml-auto">
            {itemsToolbar}
          </div>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className={tab === "items" ? "h-full min-h-0" : "hidden"}>
          {menuItemsChild}
        </div>
        {tab === "addons" && children[1]}
        {tab === "combos" && children[2]}
      </div>
    </div>
  );
}

export function StoreMenuTabs({
  storeId,
  children,
}: {
  storeId: string;
  children: [ReactNode, ReactNode, ReactNode];
}) {
  return (
    <MenuPageChromeProvider>
      <StoreMenuTabsInner storeId={storeId}>{children}</StoreMenuTabsInner>
    </MenuPageChromeProvider>
  );
}
