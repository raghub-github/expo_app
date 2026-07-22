import { useEffect, useMemo, useRef, useState } from "react";
import {
  createPushPermissionController,
  type PushPermissionController,
} from "./controller";
import type { PushControllerOptions, PushControllerSnapshot } from "./types";

/**
 * React binding for the shared push permission/token controller.
 * Creates one controller per stable options identity (apiBaseUrl + role callbacks via refs).
 */
export function usePushPermissionController(
  options: PushControllerOptions,
  opts?: { autoStart?: boolean }
): {
  snapshot: PushControllerSnapshot;
  controller: PushPermissionController;
} {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const controller = useMemo(() => {
    return createPushPermissionController({
      ...options,
      getAuth: () => optionsRef.current.getAuth(),
      collectDeviceMetadata: options.collectDeviceMetadata
        ? () => optionsRef.current.collectDeviceMetadata!()
        : undefined,
      onForeground: (p) => optionsRef.current.onForeground?.(p),
      onNotificationOpen: (p) => optionsRef.current.onNotificationOpen?.(p),
      registerStoreExpoToken: options.registerStoreExpoToken
        ? (args) => optionsRef.current.registerStoreExpoToken!(args)
        : undefined,
    });
    // Recreate when API base changes (rare).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.apiBaseUrl]);

  const [snapshot, setSnapshot] = useState<PushControllerSnapshot>(() =>
    controller.getSnapshot()
  );

  useEffect(() => {
    const unsub = controller.subscribe(setSnapshot);
    if (opts?.autoStart !== false) {
      controller.startLifecycle();
    }
    return () => {
      unsub();
      controller.stopLifecycle();
    };
  }, [controller, opts?.autoStart]);

  return { snapshot, controller };
}
