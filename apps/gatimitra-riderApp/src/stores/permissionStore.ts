import { create } from "zustand";
import type { PermissionState, PermissionType } from "@/src/services/permissions/permissionManager";
import { getItem, setItem } from "@/src/utils/storage";

const PERMISSION_STORE_KEY = "rider_permissions_state";

interface PermissionStoreState {
  permissions: PermissionState | null;
  hasRequestedPermissions: boolean;
  hydrated: boolean;
  setPermissions: (permissions: PermissionState) => void;
  setHasRequestedPermissions: (value: boolean) => void;
  refreshPermissions: () => Promise<void>;
  hydrate: () => Promise<void>;
}

export const usePermissionStore = create<PermissionStoreState>((set, get) => ({
  permissions: null,
  hasRequestedPermissions: false,
  hydrated: false,

  setPermissions: (permissions) => {
    set({ permissions });
    // Persist to storage (SecureStore on native, localStorage on web)
    void setItem(PERMISSION_STORE_KEY, JSON.stringify(permissions));
  },

  setHasRequestedPermissions: (value) => {
    set({ hasRequestedPermissions: value });
    void setItem("rider_has_requested_permissions", JSON.stringify(value));
  },

  refreshPermissions: async () => {
    try {
      const { permissionManager } = await import("@/src/services/permissions/permissionManager");
      const states = await permissionManager.getPermissionStates();
      get().setPermissions(states);
    } catch (error) {
      console.warn("Error refreshing permissions (non-critical):", error);
      // Don't throw - just log the warning
      // App should continue to work even if permission refresh fails
    }
  },

  hydrate: async () => {
    // Prevent multiple simultaneous hydrations
    if (get().hydrated) {
      console.log('[PermissionStore] Already hydrated');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'permissionStore.ts:48',message:'PermissionStore already hydrated',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return;
    }
    
    console.log('[PermissionStore] Starting hydration');
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'permissionStore.ts:53',message:'PermissionStore starting hydration',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    try {
      // Set hydrated immediately to prevent blocking, then update with data
      set({ hydrated: true });
      console.log('[PermissionStore] Set hydrated to true');
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'permissionStore.ts:57',message:'PermissionStore set hydrated to true',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      const [permissionsJson, hasRequestedJson] = await Promise.all([
        getItem(PERMISSION_STORE_KEY),
        getItem("rider_has_requested_permissions"),
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

      // Refresh location status in background (non-blocking)
      // Don't await this - let it run in background
      import("@/src/services/permissions/permissionManager")
        .then(({ permissionManager }) => permissionManager.isLocationGranted())
        .then((locationGranted) => {
          if (get().permissions) {
            const updated = { ...get().permissions! };
            updated.location_foreground = locationGranted ? "granted" : "denied";
            get().setPermissions(updated);
          }
        })
        .catch((locationError) => {
          console.warn("[PermissionStore] Could not check location during hydrate (non-critical):", locationError);
        });
    } catch (error) {
      console.error("[PermissionStore] Error hydrating permission store:", error);
      // #region agent log
      fetch('http://127.0.0.1:7243/ingest/5d17a330-9f7e-4e34-b5cc-0cddb360341d',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'permissionStore.ts:105',message:'PermissionStore hydration error',data:{error:String(error),errorStack:error?.stack,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      // Already set hydrated to true above, so app won't hang
    }
  },
}));

