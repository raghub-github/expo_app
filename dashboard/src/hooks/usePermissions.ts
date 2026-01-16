"use client";

import { useState, useEffect } from "react";

interface UserPermissions {
  isSuperAdmin: boolean;
  systemUserId: number | null;
  loading: boolean;
}

export function usePermissions(): UserPermissions {
  const [permissions, setPermissions] = useState<UserPermissions>({
    isSuperAdmin: false,
    systemUserId: null,
    loading: true,
  });

  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const response = await fetch("/api/auth/permissions");
        const result = await response.json();

        if (result.success && result.data) {
          setPermissions({
            isSuperAdmin: result.data.isSuperAdmin || false,
            systemUserId: result.data.systemUserId || null,
            loading: false,
          });
        } else {
          setPermissions({ isSuperAdmin: false, systemUserId: null, loading: false });
        }
      } catch (error) {
        console.error("Error fetching permissions:", error);
        setPermissions({ isSuperAdmin: false, systemUserId: null, loading: false });
      }
    };

    fetchPermissions();
  }, []);

  return permissions;
}
