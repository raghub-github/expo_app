import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

type NotificationPermissionGateContextValue = {
  /** Force-open the notification permission bottom sheet (only if OS not granted). */
  openPermissionGate: () => void;
  /** Close / dismiss for this session. */
  closePermissionGate: () => void;
  /** Programmatic open requested (in addition to auto gate). */
  forceOpen: boolean;
  /** Latest known OS notification grant — drives background permission sheet. */
  notificationsGranted: boolean;
  setNotificationsGranted: (granted: boolean) => void;
  /** Bump when notifications just became granted so bg sheet can open immediately. */
  bgGateNonce: number;
  signalNotificationsGranted: () => void;
};

const NotificationPermissionGateContext =
  createContext<NotificationPermissionGateContextValue | null>(null);

export function NotificationPermissionGateProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [forceOpen, setForceOpen] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [bgGateNonce, setBgGateNonce] = useState(0);

  const openPermissionGate = useCallback(() => setForceOpen(true), []);
  const closePermissionGate = useCallback(() => setForceOpen(false), []);
  const signalNotificationsGranted = useCallback(() => {
    setNotificationsGranted(true);
    setForceOpen(false);
    setBgGateNonce((n) => n + 1);
  }, []);

  const value = useMemo(
    () => ({
      openPermissionGate,
      closePermissionGate,
      forceOpen,
      notificationsGranted,
      setNotificationsGranted,
      bgGateNonce,
      signalNotificationsGranted,
    }),
    [
      openPermissionGate,
      closePermissionGate,
      forceOpen,
      notificationsGranted,
      bgGateNonce,
      signalNotificationsGranted,
    ]
  );

  return (
    <NotificationPermissionGateContext.Provider value={value}>
      {children}
    </NotificationPermissionGateContext.Provider>
  );
}

export function useNotificationPermissionGate() {
  const ctx = useContext(NotificationPermissionGateContext);
  if (!ctx) {
    return {
      openPermissionGate: () => {},
      closePermissionGate: () => {},
      forceOpen: false,
      notificationsGranted: false,
      setNotificationsGranted: (_g: boolean) => {},
      bgGateNonce: 0,
      signalNotificationsGranted: () => {},
    };
  }
  return ctx;
}
