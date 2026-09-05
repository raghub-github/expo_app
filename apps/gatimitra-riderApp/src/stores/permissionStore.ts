import { create } from "zustand";
import type { PermissionState, PermissionType } from "@/src/services/permissions/permissionManager";
import type { PermissionStepKey } from "@/src/services/permissions/smartPermissionHandler";
import { getItem, setItem } from "@/src/utils/storage";

const PERMISSION_STORE_KEY = "rider_permissions_state";
const GRANTED_PERMISSIONS_KEY = "rider_granted_permission_steps";

interface PermissionStoreState {
  permissions: PermissionState | null;
  hasRequestedPermissions: boolean;
  hydrated: boolean;
  grantedPermissionSteps: Set<PermissionStepKey>;
  setPermissions: (permissions: PermissionState) => void;
  setHasRequestedPermissions: (value: boolean) => void;
  setPermissionStepGranted: (stepKey: PermissionStepKey, granted: boolean) => void;
  isPermissionStepGranted: (stepKey: PermissionStepKey) => boolean;
  refreshPermissions: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const usePermissionStore = create<PermissionStoreState>((set, get) => ({
  permissions: null,
  hasRequestedPermissions: false,
  hydrated: false,
  grantedPermissionSteps: new Set<PermissionStepKey>(),

  setPermissions: (permissions) => {
    set({ permissions });
    // Persist to storage (SecureStore on native, localStorage on web)
    void setItem(PERMISSION_STORE_KEY, JSON.stringify(permissions));
  },

  setHasRequestedPermissions: (value) => {
    set({ hasRequestedPermissions: value });
    void setItem("rider_has_requested_permissions", JSON.stringify(value));
  },

  setPermissionStepGranted: (stepKey, granted) => {
    const current = get().grantedPermissionSteps;
    const updated = new Set(current);
    
    if (granted) {
      updated.add(stepKey);
    } else {
      updated.delete(stepKey);
    }
    
    set({ grantedPermissionSteps: updated });
    
    // Persist to storage
    void setItem(GRANTED_PERMISSIONS_KEY, JSON.stringify(Array.from(updated)));
  },

  isPermissionStepGranted: (stepKey) => {
    return get().grantedPermissionSteps.has(stepKey);
  },

  refreshPermissions: async () => {
    try {
      const { permissionManager } = await import("@/src/services/permissions/permissionManager");
      const {
        getBackgroundRunningStatus,
        getBatteryOptimizationStatus,
      } = await import("@/src/services/permissions/backgroundExecution");
      const { getNotificationPermissions } = await import(
        "@/src/services/permissions/notificationsWrapper"
      );

      const states = await permissionManager.getPermissionStates();
      get().setPermissions(states);

      const [bg, battery, notif, locationGranted] = await Promise.all([
        getBackgroundRunningStatus(),
        getBatteryOptimizationStatus(),
        getNotificationPermissions(),
        permissionManager.isLocationGranted(),
      ]);

      const steps = new Set(get().grantedPermissionSteps);
      if (bg.status === "granted") steps.add("background_running");
      else steps.delete("background_running");

      if (battery.status === "granted") steps.add("battery_optimization");
      else steps.delete("battery_optimization");

      if (notif.status === "granted") steps.add("notifications");
      else steps.delete("notifications");

      if (locationGranted) steps.add("location");
      else steps.delete("location");

      set({ grantedPermissionSteps: steps });
      void setItem(GRANTED_PERMISSIONS_KEY, JSON.stringify(Array.from(steps)));

      // If previously completed onboarding but a required OS setting was revoked,
      // send the rider through permissions again (matches "ask again if disabled").
      const requiredOk =
        steps.has("location") &&
        steps.has("notifications") &&
        (steps.has("battery_optimization") || steps.has("background_running"));
      if (get().hasRequestedPermissions && !requiredOk) {
        get().setHasRequestedPermissions(false);
      }
    } catch (error) {
      console.warn("Error refreshing permissions (non-critical):", error);
    }
  },

  hydrate: async () => {
    // Prevent multiple simultaneous hydrations
    if (get().hydrated) {
      return;
    }

    console.log('[PermissionStore] Starting hydration');
    try {
      const [permissionsJson, hasRequestedJson, grantedStepsJson] = await Promise.all([
        getItem(PERMISSION_STORE_KEY),
        getItem("rider_has_requested_permissions"),
        getItem(GRANTED_PERMISSIONS_KEY),
      ]);

      console.log('[PermissionStore] Retrieved data', { 
        hasPermissions: !!permissionsJson, 
        hasRequested: !!hasRequestedJson 
      });

      if (permissionsJson) {
        try {
          const permissions = JSON.parse(permissionsJson) as PermissionState;
          set({ permissions });
          console.log('[PermissionStore] Permissions restored');
        } catch (parseError) {
          console.warn("[PermissionStore] Failed to parse permissions JSON:", parseError);
        }
      }

      if (hasRequestedJson) {
        try {
          const hasRequested = JSON.parse(hasRequestedJson) === true;
          set({ hasRequestedPermissions: hasRequested });
          console.log('[PermissionStore] HasRequestedPermissions set to', hasRequested);
        } catch (parseError) {
          console.warn("[PermissionStore] Failed to parse hasRequestedPermissions JSON:", parseError);
        }
      }

      if (grantedStepsJson) {
        try {
          const grantedSteps = JSON.parse(grantedStepsJson) as string[];
          set({ grantedPermissionSteps: new Set(grantedSteps as PermissionStepKey[]) });
          console.log('[PermissionStore] Granted permission steps restored:', grantedSteps);
        } catch (parseError) {
          console.warn("[PermissionStore] Failed to parse granted permission steps JSON:", parseError);
        }
      }

      // Mark hydrated only after storage values are applied so routing cannot race.
      set({ hydrated: true });
      console.log('[PermissionStore] Set hydrated to true');

      // Sync real OS state (location, notifications, background) without blocking first paint.
      void get().refreshPermissions();
    } catch (error) {
      console.error("[PermissionStore] Error hydrating permission store:", error);
      set({ hydrated: true });
    }
  },
}));

