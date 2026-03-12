import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";
import { EventEmitter, NativeModulesProxy } from "expo-modules-core";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useStoreSettings } from "@/context/StoreSettingsContext";
import { getActiveOrdersCount } from "@/services/storeSettingsApi";
import { GatiMitraMerchant } from "@/constants/theme";

type EventSubscription = {
  remove: () => void;
};

function toArgb(color: string): number {
  // Expect #RRGGBB
  const hex = color.replace("#", "");
  const num = parseInt(hex, 16);
  // Opaque alpha
  return (0xff << 24) | num;
}

function formatCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export default function FloatingOrdersManager() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const { settings } = useStoreSettings();
  const router = useRouter();

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentCountRef = useRef<number>(0);
  const listenersRef = useRef<EventSubscription[]>([]);
  const permissionRequestedRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const native = (NativeModulesProxy as any)?.ExpoFloatingBubble as
      | {
          canDrawOverlays?: () => Promise<boolean>;
          requestOverlayPermission?: () => void;
          showOverlay?: (options?: any) => void;
          hideOverlay?: () => void;
          hideBubble?: () => void;
        }
      | undefined;

    if (!native) {
      // Running without native module (e.g. Expo Go) – silently disable overlay.
      return undefined;
    }

    const emitter = new EventEmitter(native as any);

    const floating = {
      canDrawOverlays: async () => {
        if (typeof native.canDrawOverlays === "function") {
          return native.canDrawOverlays();
        }
        return false;
      },
      requestOverlayPermission: () => {
        if (typeof native.requestOverlayPermission === "function") {
          native.requestOverlayPermission();
        }
      },
      showOverlay: (options?: any) => {
        if (typeof native.showOverlay === "function") {
          native.showOverlay(options);
        }
      },
      hideOverlay: () => {
        if (typeof native.hideOverlay === "function") {
          native.hideOverlay();
        }
      },
      hideBubble: () => {
        if (typeof native.hideBubble === "function") {
          native.hideBubble();
        }
      },
      addListener: (eventName: string, listener: (event: any) => void): EventSubscription => {
        const sub = emitter.addListener(eventName, listener);
        return {
          remove: () => sub.remove(),
        };
      },
    };
    if (!floating) {
      // Native module not available (e.g. Expo Go). Do nothing.
      return undefined;
    }

    const enabled = !!token && !!selectedStore?.id && settings.show_floating_orders;
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    async function ensurePermission(): Promise<boolean> {
      try {
        const has = await floating.canDrawOverlays();
        if (has) return true;
        if (!permissionRequestedRef.current) {
          permissionRequestedRef.current = true;
          floating.requestOverlayPermission();
        }
      } catch {
        // ignore
      }
      return false;
    }

    async function showOrUpdateOverlay(count: number) {
      const text = formatCount(count);
      const bubbleColorArgb = toArgb(GatiMitraMerchant.primary);
      const accent = GatiMitraMerchant.navy;
      floating.showOverlay({
        componentConfig: {
          type: "container",
          style: {
            backgroundColor: "#00000000",
            padding: 0,
          },
          children: [
            {
              type: "button",
              text,
              style: {
                width: 56,
                height: 56,
                backgroundColor: GatiMitraMerchant.primary,
                color: "#FFFFFF",
                borderRadius: 28,
                padding: 0,
                elevation: 8,
                shadowColor: "#000000",
                shadowRadius: 8,
              },
              onPress: "openOrders",
            },
            {
              type: "text",
              text: "Live orders",
              style: {
                color: accent,
                fontSize: 10,
                textAlign: "center",
                fontWeight: "bold",
              },
            },
          ],
        },
        bubbleColor: bubbleColorArgb,
      });
    }

    function clearListeners() {
      for (const l of listenersRef.current) {
        try {
          l.remove();
        } catch {
          // ignore
        }
      }
      listenersRef.current = [];
    }

    function stopService() {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      clearListeners();
      try {
        floating.hideOverlay();
        floating.hideBubble();
      } catch {
        // ignore
      }
    }

    async function start() {
      const ok = await ensurePermission();
      if (!ok || cancelled || !token || !selectedStore?.id) return;

      // Initial fetch
      try {
        const count = await getActiveOrdersCount(selectedStore.id, token);
        currentCountRef.current = count;
        await showOrUpdateOverlay(count);
      } catch {
        await showOrUpdateOverlay(0);
      }

      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(async () => {
        if (cancelled || !token || !selectedStore?.id) return;
        try {
          const count = await getActiveOrdersCount(selectedStore.id, token);
          if (count !== currentCountRef.current) {
            currentCountRef.current = count;
            await showOrUpdateOverlay(count);
          }
        } catch {
          // keep last count
        }
      }, 5000);

      clearListeners();
      const sub = floating.addListener("onCustomAction", (event: any) => {
        if (event?.actionId === "openOrders") {
          router.push("/(tabs)/orders?tab=active" as any);
        }
      });
      listenersRef.current.push(sub);
    }

    void start();

    return () => {
      cancelled = true;
      stopService();
    };
  }, [token, selectedStore?.id, settings.show_floating_orders, router]);

  return null;
}

