/**
 * Single shared History API patch for the control dashboard.
 * Multiple hooks (browser pathname, ticket panel search) subscribe here so we
 * never nest competing pushState/replaceState wrappers.
 *
 * All listener notifications are deferred (macrotask) so React never receives
 * updates synchronously from patched history during useInsertionEffect (Next 16).
 */

type Listener = () => void;

const pathnameListeners = new Set<Listener>();
const searchListeners = new Set<Listener>();

let historyPatched = false;
let origPushState: History["pushState"] | null = null;
let origReplaceState: History["replaceState"] | null = null;
let pathnameNotifyTimeout: number | null = null;
let searchNotifyTimeout: number | null = null;

function flushPathnameListeners() {
  pathnameNotifyTimeout = null;
  for (const fn of Array.from(pathnameListeners)) {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function flushSearchListeners() {
  searchNotifyTimeout = null;
  for (const fn of Array.from(searchListeners)) {
    try {
      fn();
    } catch {
      /* ignore subscriber errors */
    }
  }
}

function notifyPathnameListenersDeferred() {
  if (typeof window === "undefined") return;
  if (pathnameNotifyTimeout != null) return;
  pathnameNotifyTimeout = window.setTimeout(flushPathnameListeners, 0);
}

function notifySearchListenersDeferred() {
  if (typeof window === "undefined") return;
  if (searchNotifyTimeout != null) return;
  searchNotifyTimeout = window.setTimeout(flushSearchListeners, 0);
}

function onHistoryChange() {
  notifyPathnameListenersDeferred();
  notifySearchListenersDeferred();
}

function ensureHistoryPatch() {
  if (historyPatched || typeof window === "undefined") return;
  historyPatched = true;
  origPushState = history.pushState.bind(history);
  origReplaceState = history.replaceState.bind(history);

  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    const result = origPushState!(...args);
    onHistoryChange();
    return result;
  }) as History["pushState"];

  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    const result = origReplaceState!(...args);
    onHistoryChange();
    return result;
  }) as History["replaceState"];

  window.addEventListener("popstate", onHistoryChange);
}

export function subscribeBrowserPathname(onStoreChange: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  ensureHistoryPatch();
  pathnameListeners.add(onStoreChange);
  return () => {
    pathnameListeners.delete(onStoreChange);
  };
}

export function subscribeLocationSearch(onStoreChange: Listener): () => void {
  if (typeof window === "undefined") return () => {};
  ensureHistoryPatch();
  searchListeners.add(onStoreChange);
  return () => {
    searchListeners.delete(onStoreChange);
  };
}

export function readBrowserPathname(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.split("?")[0].split("#")[0];
}

export function readLocationSearch(): string {
  return typeof window !== "undefined" ? window.location.search : "";
}
