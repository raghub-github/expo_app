/** Shared menu page chrome — matches partnersite mx/menu visual system */
export const MENU_PAGE_GLOBAL_STYLES = `
  .menu-page-root ::-webkit-scrollbar { display: none; }
  .menu-page-root { scrollbar-width: none; -ms-overflow-style: none; }
  .menu-page-root .scrollbar-hide::-webkit-scrollbar { display: none; }
  .menu-page-root .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
`;

export const menuStatCard =
  "bg-gray-50 border border-gray-200 rounded-md px-3 py-2 min-w-[100px]";

export const menuCategoryChipActive = "bg-orange-500 text-white shadow-sm ring-1 ring-orange-200";
export const menuCategoryChipIdle =
  "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-transparent";

export const menuItemCard =
  "rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-all overflow-hidden";

export const menuSearchInput =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:border-orange-400 focus:ring-1 focus:ring-orange-100 text-gray-900";

export const menuFilterSelect =
  "px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-900";
