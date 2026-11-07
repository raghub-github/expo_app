import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { isDutyDispatchAuthorized } from "@/src/lib/dutySyncAuthority";
import { riderDispatchLog } from "@/src/lib/rider-dispatch-log";
import { dispatchSessionKey } from "@/src/lib/riderDispatchPolicy";
import {
  startRiderDispatchLifecycle,
  stopRiderDispatchLifecycle,
} from "@/src/lib/riderDispatchLifecycle";

/**
 * Binds the process-wide dispatch lifecycle to the authenticated rider session.
 * One subsystem per session — not per tab/screen.
 * Starts only after backend-confirmed ON duty (never from cached isOnDuty alone).
 */
export function useRiderDispatchRecovery(): void {
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const hydrated = useSessionStore((s) => s.hydrated);
  const syncPhase = useDutyStore((s) => s.syncPhase);
  const dutyHydrated = useDutyStore((s) => s.hydrated);
  const prevDutyRef = useRef<boolean | null>(null);
  const prevSessionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!hydrated || !dutyHydrated) return;

    if (!session?.accessToken || session.role !== "rider") {
      stopRiderDispatchLifecycle("unauthenticated");
      prevDutyRef.current = null;
      prevSessionKeyRef.current = null;
      return;
    }

    const riderId =
      session.riderId?.trim() || session.userId?.trim() || "";
    const sessionKey = dispatchSessionKey({
      userId: session.userId,
      riderId: session.riderId,
      accessToken: session.accessToken,
    });

    if (prevSessionKeyRef.current && prevSessionKeyRef.current !== sessionKey) {
      riderDispatchLog("SESSION READY", { sessionKey, riderId });
    } else if (!prevSessionKeyRef.current) {
      riderDispatchLog("SESSION READY", { sessionKey, riderId });
    }
    prevSessionKeyRef.current = sessionKey;

    const authorized = isDutyDispatchAuthorized(syncPhase);
    if (!authorized) {
      if (prevDutyRef.current === true) {
        riderDispatchLog("DUTY OFF", { syncPhase });
      }
      prevDutyRef.current = false;
      stopRiderDispatchLifecycle(
        syncPhase === "sync_failed" || syncPhase === "syncing" || syncPhase === "unknown"
          ? "duty_unverified"
          : "duty_off"
      );
      return;
    }

    if (prevDutyRef.current !== true) {
      riderDispatchLog("DUTY ON", { riderId, syncPhase });
    }
    prevDutyRef.current = true;

    startRiderDispatchLifecycle({
      queryClient,
      sessionKey,
      riderId,
    });
  }, [
    hydrated,
    dutyHydrated,
    session?.accessToken,
    session?.role,
    session?.userId,
    session?.riderId,
    syncPhase,
    queryClient,
  ]);
}
