"use client";

// src/components/layout/HierarchicalSidebar.tsx
import { useAppPathname } from "@/hooks/useAppSearchParams";
import { useState, useMemo, useEffect as useEffect2, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Poppins } from "next/font/google";
import { useRouter } from "next/navigation";

// ../node_modules/@tanstack/react-query/build/modern/QueryClientProvider.js
import * as React from "react";
import { jsx } from "react/jsx-runtime";
var QueryClientContext = React.createContext(
  void 0
);
var useQueryClient = (queryClient) => {
  const client = React.useContext(QueryClientContext);
  if (queryClient) {
    return queryClient;
  }
  if (!client) {
    throw new Error("No QueryClient set, use QueryClientProvider to set one");
  }
  return client;
};

// src/components/layout/HierarchicalSidebar.tsx
import { prefetchDashboardSection } from "@/lib/dashboard-prefetch";

// ../node_modules/lucide-react/dist/esm/createLucideIcon.js
import { forwardRef as forwardRef2, createElement as createElement2 } from "react";

// ../node_modules/lucide-react/dist/esm/shared/src/utils.js
var toKebabCase = (string) => string.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var toCamelCase = (string) => string.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (match, p1, p2) => p2 ? p2.toUpperCase() : p1.toLowerCase()
);
var toPascalCase = (string) => {
  const camelCase = toCamelCase(string);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
};
var mergeClasses = (...classes) => classes.filter((className, index, array) => {
  return Boolean(className) && className.trim() !== "" && array.indexOf(className) === index;
}).join(" ").trim();
var hasA11yProp = (props) => {
  for (const prop in props) {
    if (prop.startsWith("aria-") || prop === "role" || prop === "title") {
      return true;
    }
  }
};

// ../node_modules/lucide-react/dist/esm/Icon.js
import { forwardRef, createElement } from "react";

// ../node_modules/lucide-react/dist/esm/defaultAttributes.js
var defaultAttributes = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};

// ../node_modules/lucide-react/dist/esm/Icon.js
var Icon = forwardRef(
  ({
    color = "currentColor",
    size = 24,
    strokeWidth = 2,
    absoluteStrokeWidth,
    className = "",
    children,
    iconNode,
    ...rest
  }, ref) => createElement(
    "svg",
    {
      ref,
      ...defaultAttributes,
      width: size,
      height: size,
      stroke: color,
      strokeWidth: absoluteStrokeWidth ? Number(strokeWidth) * 24 / Number(size) : strokeWidth,
      className: mergeClasses("lucide", className),
      ...!children && !hasA11yProp(rest) && { "aria-hidden": "true" },
      ...rest
    },
    [
      ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
      ...Array.isArray(children) ? children : [children]
    ]
  )
);

// ../node_modules/lucide-react/dist/esm/createLucideIcon.js
var createLucideIcon = (iconName, iconNode) => {
  const Component = forwardRef2(
    ({ className, ...props }, ref) => createElement2(Icon, {
      ref,
      iconNode,
      className: mergeClasses(
        `lucide-${toKebabCase(toPascalCase(iconName))}`,
        `lucide-${iconName}`,
        className
      ),
      ...props
    })
  );
  Component.displayName = toPascalCase(iconName);
  return Component;
};

// ../node_modules/lucide-react/dist/esm/icons/chevron-left.js
var __iconNode = [["path", { d: "m15 18-6-6 6-6", key: "1wnfg3" }]];
var ChevronLeft = createLucideIcon("chevron-left", __iconNode);

// ../node_modules/lucide-react/dist/esm/icons/log-out.js
var __iconNode2 = [
  ["path", { d: "m16 17 5-5-5-5", key: "1bji2h" }],
  ["path", { d: "M21 12H9", key: "dn1m92" }],
  ["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", key: "1uf3rs" }]
];
var LogOut = createLucideIcon("log-out", __iconNode2);

// ../node_modules/lucide-react/dist/esm/icons/x.js
var __iconNode3 = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
];
var X = createLucideIcon("x", __iconNode3);

// src/components/layout/HierarchicalSidebar.tsx
import { useDashboardAccess } from "@/hooks/useDashboardAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/providers/AuthProvider";
import {
  mainNavigation,
  getCurrentDashboard,
  getCurrentDashboardSubRoutes,
  isSuperAdminNavPath
} from "@/lib/navigation/dashboard-routes";
import { getOrdersNavHref, isOrdersSectionPath } from "@/lib/navigation/orders-nav-href";
import { useLeftSidebarMobile } from "@/context/LeftSidebarMobileContext";
import { useLogout } from "@/hooks/queries/useAuthQuery";
import { getUserInitials } from "@/lib/user-avatar";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useCurrentRoute } from "@/context/CurrentRouteContext";
import { TICKETS_QUEUE_HOME_PATH, isTicketsQueueWorkspacePath } from "@/lib/tickets/ticket-path-utils";
import {
  cleanDashboardHref,
  getDashboardModuleKey,
  isDashboardNavAlreadyAtTarget
} from "@/lib/navigation/dashboard-nav-transition";
import { Fragment, jsx as jsx2, jsxs } from "react/jsx-runtime";
var sidebarFont = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap"
});
var SIDEBAR_BG = "#121212";
var TOOLTIP_BG = "#121212";
function HierarchicalSidebar({ isOpen, onToggle, isInSpecificDashboard: propIsInSpecificDashboard, onNavigationStart }) {
  const router = useRouter();
  const pathname = useAppPathname();
  const queryClient = useQueryClient();
  const { dashboards, loading: accessLoading, error: accessError } = useDashboardAccess();
  const handleNavPrefetch = useCallback(
    (href) => {
      prefetchDashboardSection(queryClient, href);
    },
    [queryClient]
  );
  const { isSuperAdmin, loading: permissionsLoading, error: permissionsError } = usePermissions();
  const [isMainMenuOpen, setIsMainMenuOpen] = useState(false);
  const mobileCtx = useLeftSidebarMobile();
  const [internalMobileOpen, setInternalMobileOpen] = useState(false);
  const isMobileMenuOpen = mobileCtx ? mobileCtx.isMobileMenuOpen : internalMobileOpen;
  const setMobileMenuOpen = mobileCtx ? mobileCtx.setMobileMenuOpen : setInternalMobileOpen;
  const [hydrated, setHydrated] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const currentRouteCtx = useCurrentRoute();
  const pendingNavHref = currentRouteCtx?.pendingNavHref ?? null;
  const { user: authUser, systemUser } = useAuth();
  const logoutMutation = useLogout();
  const [identityReady, setIdentityReady] = useState(false);
  const userEmail = systemUser?.email ?? authUser?.email ?? null;
  const userMetadata = authUser?.user_metadata ?? {};
  const userName = systemUser?.fullName ?? (typeof userMetadata?.full_name === "string" ? userMetadata.full_name : null) ?? (typeof userMetadata?.name === "string" ? userMetadata.name : null) ?? (userEmail ? userEmail.split("@")[0] : null) ?? null;
  const avatarUrl = (typeof userMetadata?.avatar_url === "string" ? userMetadata.avatar_url : null) ?? (typeof userMetadata?.picture === "string" ? userMetadata.picture : null) ?? null;
  useEffect2(() => {
    setIdentityReady(true);
    setHydrated(true);
  }, []);
  const cleanPathname = useMemo(() => pathname.split("?")[0].split("#")[0], [pathname]);
  const isTicketsQueueWorkspace = useMemo(() => isTicketsQueueWorkspacePath(cleanPathname), [cleanPathname]);
  const currentDashboard = useMemo(
    () => getCurrentDashboard(cleanPathname),
    [cleanPathname]
  );
  const currentSubRoutes = useMemo(
    () => getCurrentDashboardSubRoutes(cleanPathname),
    [cleanPathname]
  );
  const isInSpecificDashboard = propIsInSpecificDashboard ?? (currentDashboard && cleanPathname !== "/dashboard");
  useEffect2(() => {
    if (currentDashboard && cleanPathname !== "/dashboard") {
      setIsMainMenuOpen(false);
    }
  }, [cleanPathname, currentDashboard]);
  const isLoading = accessLoading || permissionsLoading;
  const hasError = Boolean(accessError || permissionsError);
  const accessibleDashboards = useMemo(() => {
    if (hasError) return null;
    if (isLoading) return /* @__PURE__ */ new Set();
    if (dashboards.length === 0) return isSuperAdmin ? null : /* @__PURE__ */ new Set();
    return new Set(
      dashboards.filter((d) => d.isActive).map((d) => d.dashboardType)
    );
  }, [dashboards, isLoading, hasError, isSuperAdmin]);
  const handleModuleNavIntent = useCallback(
    (targetHref) => {
      const cleanTarget = cleanDashboardHref(targetHref);
      if (isDashboardNavAlreadyAtTarget(cleanPathname, cleanTarget)) return;
      onNavigationStart?.(cleanTarget);
    },
    [cleanPathname, onNavigationStart]
  );
  const handleModuleNavClick = useCallback(
    (event, targetHref) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      setMobileMenuOpen(false);
      const cleanTarget = cleanDashboardHref(targetHref);
      if (isDashboardNavAlreadyAtTarget(cleanPathname, cleanTarget)) {
        event.preventDefault();
        return;
      }
      handleModuleNavIntent(cleanTarget);
      event.preventDefault();
      router.push(cleanTarget, { scroll: false });
    },
    [cleanPathname, handleModuleNavIntent, router, setMobileMenuOpen]
  );
  const effectiveSuperAdmin = hasError ? true : isSuperAdmin;
  const filteredNavigation = useMemo(() => {
    return mainNavigation.filter((item) => {
      if (item.href === "/dashboard") return true;
      if (item.requiresSuperAdmin) return effectiveSuperAdmin;
      if (accessibleDashboards === null) return true;
      if (item.dashboardType) {
        if (effectiveSuperAdmin) return true;
        if (item.dashboardType === "ORDER_FOOD") {
          return accessibleDashboards.has("ORDER_FOOD") || accessibleDashboards.has("ORDER_PERSON_RIDE") || accessibleDashboards.has("ORDER_PARCEL");
        }
        return accessibleDashboards.has(item.dashboardType);
      }
      return true;
    });
  }, [effectiveSuperAdmin, accessibleDashboards]);
  useEffect2(() => {
    setMobileMenuOpen(false);
  }, [pathname, setMobileMenuOpen]);
  useEffect2(() => {
    if (!isMobileMenuOpen) return;
    const onPop = () => setMobileMenuOpen(false);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [isMobileMenuOpen, setMobileMenuOpen]);
  const showSkeleton = !hydrated || isLoading;
  const mobileTranslate = isMobileMenuOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full";
  const sidebarBase = `fixed inset-y-0 left-0 z-40 flex h-screen max-lg:w-72 flex-col shrink-0 overflow-hidden lg:translate-x-0 ${mobileTranslate} ${isOpen ? "lg:w-56" : "lg:w-16"} ${sidebarFont.className} ${showSkeleton ? "" : "transition-[transform,width] duration-[220ms] ease-in-out"}`;
  const asideStyle = {
    background: SIDEBAR_BG,
    scrollbarWidth: "thin",
    scrollbarColor: "rgba(255,255,255,0.2) transparent"
  };
  const navItemBase = "group relative flex h-11 w-full items-center rounded-xl outline-none transition-[background-color,color] duration-[220ms] ease-in-out focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#121212]";
  const navItemActive = "bg-white/10 text-white";
  const navItemIdle = "text-slate-300 hover:bg-white/[0.06] hover:text-white";
  if (showSkeleton) {
    return /* @__PURE__ */ jsx2("aside", { className: sidebarBase, style: asideStyle, "aria-busy": "true", "aria-label": "Loading navigation", children: /* @__PURE__ */ jsxs("div", { className: "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden", style: { background: SIDEBAR_BG }, children: [
      /* @__PURE__ */ jsxs("div", { className: "flex h-[72px] min-h-[72px] items-center px-3 shrink-0", style: { background: SIDEBAR_BG }, children: [
        /* @__PURE__ */ jsx2(
          "span",
          {
            className: "flex size-10 shrink-0 items-center justify-center rounded-[12px] ring-1 ring-white/10",
            style: { background: SIDEBAR_BG },
            children: /* @__PURE__ */ jsx2(
              Image,
              {
                src: "/onlylogo.png",
                alt: "",
                width: 32,
                height: 32,
                className: "opacity-80",
                priority: true
              }
            )
          }
        ),
        isOpen ? /* @__PURE__ */ jsxs("div", { className: "ml-3 space-y-1.5 min-w-0", children: [
          /* @__PURE__ */ jsx2("div", { className: "h-3.5 w-24 rounded-md bg-white/10 animate-pulse" }),
          /* @__PURE__ */ jsx2("div", { className: "h-2.5 w-16 rounded-md bg-white/10 animate-pulse" })
        ] }) : null
      ] }),
      /* @__PURE__ */ jsx2("nav", { className: "flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-2", children: /* @__PURE__ */ jsx2("div", { className: "space-y-1.5", children: [1, 2, 3, 4, 5, 6, 7].map((i) => /* @__PURE__ */ jsxs("div", { className: "flex h-11 w-full items-center rounded-xl", children: [
        /* @__PURE__ */ jsx2("span", { className: "flex size-10 shrink-0 items-center justify-center", children: /* @__PURE__ */ jsx2("span", { className: "h-5 w-5 rounded-md bg-white/10 animate-pulse" }) }),
        isOpen ? /* @__PURE__ */ jsx2("span", { className: "ml-0 h-3.5 w-24 rounded bg-white/10 animate-pulse" }) : null
      ] }, i)) }) }),
      /* @__PURE__ */ jsxs("div", { className: "mt-auto shrink-0 flex flex-col", children: [
        /* @__PURE__ */ jsx2("div", { className: "mx-3 hidden h-px bg-white/[0.08] lg:block", "aria-hidden": true }),
        /* @__PURE__ */ jsx2("div", { className: "hidden lg:block p-3", children: /* @__PURE__ */ jsx2("div", { className: "flex h-10 w-full items-center justify-center rounded-[10px] border border-white/10 bg-transparent", children: /* @__PURE__ */ jsx2("div", { className: "h-4 w-4 rounded bg-white/15 animate-pulse" }) }) })
      ] })
    ] }) });
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx2("aside", { className: sidebarBase, style: asideStyle, children: /* @__PURE__ */ jsxs("div", { className: "flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden", style: { background: SIDEBAR_BG }, children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          className: "flex h-[72px] min-h-[72px] items-center px-3 shrink-0",
          style: { background: SIDEBAR_BG },
          children: [
            /* @__PURE__ */ jsxs(
              Link,
              {
                href: "/dashboard",
                scroll: false,
                className: "flex min-w-0 flex-1 items-center outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-xl",
                onPointerDown: (e) => handleModuleNavPointerDown(e, "/dashboard"),
                onClick: (e) => handleModuleNavClick(e, "/dashboard"),
                title: "GatiMitra",
                children: [
                  /* @__PURE__ */ jsx2(
                    "span",
                    {
                      className: "flex size-10 shrink-0 items-center justify-center rounded-[12px] ring-1 ring-white/10",
                      style: { background: SIDEBAR_BG },
                      children: /* @__PURE__ */ jsx2(
                        Image,
                        {
                          src: "/onlylogo.png",
                          alt: "GatiMitra",
                          width: 32,
                          height: 32,
                          className: "size-8 object-contain",
                          priority: true
                        }
                      )
                    }
                  ),
                  /* @__PURE__ */ jsxs(
                    "span",
                    {
                      className: `min-w-0 flex flex-col overflow-hidden transition-[opacity,margin] duration-[220ms] ease-in-out ${isOpen ? "ml-3 opacity-100" : "pointer-events-none ml-0 w-0 opacity-0 max-lg:pointer-events-auto max-lg:ml-3 max-lg:w-auto max-lg:opacity-100"}`,
                      "aria-hidden": !isOpen,
                      children: [
                        /* @__PURE__ */ jsx2("span", { className: "truncate text-[15px] font-semibold leading-tight tracking-wide text-white whitespace-nowrap", children: "GatiMitra" }),
                        /* @__PURE__ */ jsx2("span", { className: "mt-0.5 truncate text-[10px] font-medium leading-tight tracking-[0.06em] uppercase text-slate-400 whitespace-nowrap", children: "Control Dashboard" })
                      ]
                    }
                  )
                ]
              }
            ),
            /* @__PURE__ */ jsx2(
              "button",
              {
                type: "button",
                onClick: onToggle,
                className: "inline-flex shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors duration-[220ms] hover:bg-white/[0.06] hover:text-white lg:hidden",
                "aria-label": "Close sidebar",
                children: /* @__PURE__ */ jsx2(X, { className: "h-4 w-4" })
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsx2("nav", { className: "flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-2", children: /* @__PURE__ */ jsx2("div", { className: "space-y-1.5", children: filteredNavigation.map((item) => {
        const inQueueWorkspace = isTicketsQueueWorkspacePath(cleanPathname);
        const prefetchHref = item.href === "/dashboard/tickets" && inQueueWorkspace ? TICKETS_QUEUE_HOME_PATH : item.dashboardType === "ORDER_FOOD" ? getOrdersNavHref(accessibleDashboards, effectiveSuperAdmin) : item.href;
        const moduleRootHref = item.dashboardType === "ORDER_FOOD" ? "/dashboard/orders" : item.href === "/dashboard/tickets" && inQueueWorkspace ? TICKETS_QUEUE_HOME_PATH : item.href;
        const isRouteActive = cleanPathname === moduleRootHref || item.href !== "/dashboard" && cleanPathname.startsWith(item.href + "/") || item.dashboardType === "ORDER_FOOD" && isOrdersSectionPath(cleanPathname) || item.href === "/dashboard/super-admin" && isSuperAdminNavPath(cleanPathname);
        const isActive = pendingNavHref !== null ? moduleRootHref === pendingNavHref || getDashboardModuleKey(moduleRootHref) === getDashboardModuleKey(pendingNavHref) : isRouteActive;
        const Icon2 = item.icon;
        return /* @__PURE__ */ jsxs(
          Link,
          {
            href: moduleRootHref,
            scroll: false,
            onMouseEnter: () => handleNavPrefetch(prefetchHref),
            onFocus: () => handleNavPrefetch(prefetchHref),
            onClick: (e) => handleModuleNavClick(e, moduleRootHref),
            className: `${navItemBase} ${isActive ? navItemActive : navItemIdle}`,
            title: !isOpen ? item.name : void 0,
            "aria-current": isActive ? "page" : void 0,
            children: [
              /* @__PURE__ */ jsx2("span", { className: "flex size-10 shrink-0 items-center justify-center", children: /* @__PURE__ */ jsx2(
                Icon2,
                {
                  className: `h-5 w-5 stroke-[1.6] transition-colors duration-[220ms] ${isActive ? "text-white" : "text-slate-300 group-hover:text-white"}`
                }
              ) }),
              /* @__PURE__ */ jsx2(
                "span",
                {
                  className: `min-w-0 flex-1 truncate text-[14px] font-medium tracking-wide whitespace-nowrap transition-[opacity,max-width] duration-[220ms] ease-in-out ${isOpen ? "max-w-[140px] opacity-100 pr-2" : "max-w-0 opacity-0 overflow-hidden max-lg:max-w-[140px] max-lg:opacity-100 max-lg:pr-2"}`,
                  children: item.name
                }
              ),
              !isOpen && /* @__PURE__ */ jsxs(
                "div",
                {
                  className: "pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity duration-[220ms] group-hover:opacity-100 max-lg:hidden",
                  style: { background: TOOLTIP_BG },
                  children: [
                    item.name,
                    /* @__PURE__ */ jsx2(
                      "span",
                      {
                        className: "absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 border-[6px] border-transparent",
                        style: { borderRightColor: TOOLTIP_BG }
                      }
                    )
                  ]
                }
              )
            ]
          },
          item.name
        );
      }) }) }),
      /* @__PURE__ */ jsxs("div", { className: "mt-auto shrink-0 flex flex-col", children: [
        /* @__PURE__ */ jsx2("div", { className: "mx-3 hidden h-px bg-white/[0.08] lg:block", "aria-hidden": true }),
        /* @__PURE__ */ jsx2("div", { className: "hidden lg:block p-3", children: /* @__PURE__ */ jsxs(
          "button",
          {
            type: "button",
            onClick: onToggle,
            className: `flex h-10 w-full items-center justify-center rounded-[10px] border border-white/10 bg-transparent text-white transition-colors duration-[220ms] hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${isOpen ? "gap-2" : ""}`,
            title: isOpen ? "Collapse sidebar" : "Expand sidebar",
            "aria-label": isOpen ? "Collapse sidebar" : "Expand sidebar",
            children: [
              /* @__PURE__ */ jsx2(
                ChevronLeft,
                {
                  className: `h-4 w-4 stroke-[1.75] shrink-0 transition-transform duration-[220ms] ${isOpen ? "" : "rotate-180"}`,
                  "aria-hidden": true
                }
              ),
              isOpen ? /* @__PURE__ */ jsx2("span", { className: "text-[13px] font-medium tracking-wide whitespace-nowrap", children: "Collapse" }) : null
            ]
          }
        ) }),
        /* @__PURE__ */ jsxs("div", { className: "lg:hidden px-4 py-5", children: [
          !identityReady ? /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-3", "aria-hidden": true, children: [
            /* @__PURE__ */ jsx2("div", { className: "h-10 w-10 rounded-full bg-white/15 shrink-0 animate-pulse" }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 space-y-2", children: [
              /* @__PURE__ */ jsx2("div", { className: "h-4 w-24 rounded bg-white/15 animate-pulse" }),
              /* @__PURE__ */ jsx2("div", { className: "h-3 w-32 rounded bg-white/10 animate-pulse" })
            ] })
          ] }) : /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 mb-3", children: [
            /* @__PURE__ */ jsx2("div", { className: "h-10 w-10 rounded-full bg-white/15 flex items-center justify-center text-white text-sm font-semibold overflow-hidden shrink-0 ring-1 ring-white/15", children: avatarUrl ? /* @__PURE__ */ jsx2("img", { src: avatarUrl, alt: "", className: "h-full w-full object-cover" }) : getUserInitials(userName, userEmail) }),
            /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
              /* @__PURE__ */ jsx2("p", { className: "text-sm font-semibold text-white truncate", children: userName || "User" }),
              userEmail ? /* @__PURE__ */ jsx2("p", { className: "text-xs text-slate-400 truncate", children: userEmail }) : null
            ] })
          ] }),
          !isTicketsQueueWorkspace && /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: () => setShowLogoutConfirm(true),
              className: "w-full flex items-center justify-center gap-2 rounded-xl border border-red-400/50 text-red-200 py-3 text-sm font-medium hover:bg-red-500/20 transition-colors duration-[220ms] min-h-[44px]",
              children: [
                /* @__PURE__ */ jsx2(LogOut, { className: "h-4 w-4" }),
                "Logout"
              ]
            }
          )
        ] })
      ] })
    ] }) }),
    isMobileMenuOpen && /* @__PURE__ */ jsx2(
      "div",
      {
        className: "fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity duration-300",
        onClick: () => setMobileMenuOpen(false),
        "aria-hidden": "true"
      }
    ),
    showLogoutConfirm && !isTicketsQueueWorkspace && /* @__PURE__ */ jsx2(
      "div",
      {
        className: "fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm",
        role: "dialog",
        "aria-modal": "true",
        onClick: () => setShowLogoutConfirm(false),
        children: /* @__PURE__ */ jsxs(
          "div",
          {
            className: "w-full max-w-sm rounded-2xl border border-gray-200 bg-white shadow-2xl p-6",
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsx2("h3", { className: "text-lg font-semibold text-gray-900 text-center", children: "Sign out?" }),
              /* @__PURE__ */ jsx2("p", { className: "mt-2 text-sm text-gray-500 text-center", children: "You will need to sign in again to access the dashboard." }),
              /* @__PURE__ */ jsxs("div", { className: "mt-6 flex gap-3", children: [
                /* @__PURE__ */ jsx2("button", { type: "button", onClick: () => setShowLogoutConfirm(false), className: "flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl", children: "Cancel" }),
                /* @__PURE__ */ jsx2(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      setShowLogoutConfirm(false);
                      logoutMutation.mutate();
                    },
                    disabled: logoutMutation.isPending,
                    className: "flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50",
                    children: logoutMutation.isPending ? /* @__PURE__ */ jsx2(LoadingSpinner, { variant: "button", size: "sm" }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                      /* @__PURE__ */ jsx2(LogOut, { className: "h-4 w-4" }),
                      " Sign out"
                    ] })
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
}
export {
  HierarchicalSidebar
};
/*! Bundled license information:

lucide-react/dist/esm/shared/src/utils.js:
lucide-react/dist/esm/defaultAttributes.js:
lucide-react/dist/esm/Icon.js:
lucide-react/dist/esm/createLucideIcon.js:
lucide-react/dist/esm/icons/chevron-left.js:
lucide-react/dist/esm/icons/log-out.js:
lucide-react/dist/esm/icons/x.js:
lucide-react/dist/esm/lucide-react.js:
  (**
   * @license lucide-react v0.562.0 - ISC
   *
   * This source code is licensed under the ISC license.
   * See the LICENSE file in the root directory of this source tree.
   *)
*/
