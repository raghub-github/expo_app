/**
 * Release-build console suppression.
 *
 * 44 of the app's `console.log` calls are not `__DEV__`-guarded, so they ship.
 * Each one crosses to native logcat and stringifies its arguments on the JS
 * thread — measurable overhead in hot paths (the live-tracking GPS filter logs
 * per sample, the location reconcile logs per resume).
 *
 * Ideally this is `babel-plugin-transform-remove-console`, which strips the
 * calls at build time and costs literally nothing at runtime. That plugin is
 * not currently a dependency, so this does the next best thing: replaces the
 * methods with no-ops once, at startup, in release only. `error` and `warn` are
 * kept as crash breadcrumbs rather than discarded, since they are the trail we
 * need when diagnosing a field crash.
 */

import { reportHandledError } from "@/lib/crashReporting";

let installed = false;

export function installReleaseConsoleSilencer(): void {
  if (__DEV__ || installed) return;
  installed = true;

  const noop = () => {};
  const target = console as unknown as Record<string, unknown>;

  for (const method of ["log", "info", "debug", "trace", "table", "dir", "group", "groupEnd"]) {
    if (typeof target[method] === "function") target[method] = noop;
  }

  // Keep the signal, drop the logcat round-trip.
  target.warn = (...args: unknown[]) => {
    reportHandledError("console.warn", args.length === 1 ? args[0] : args.map(String).join(" "));
  };
  target.error = (...args: unknown[]) => {
    reportHandledError("console.error", args.length === 1 ? args[0] : args.map(String).join(" "));
  };
}
