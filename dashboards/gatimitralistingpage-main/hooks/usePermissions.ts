'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { Permission } from '@/types';

export function usePermissions() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [permissions, setPermissions] = useState<Permission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      fetchPermissions();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/permissions?userId=${user?.id}`);
      const data = await response.json();
      setPermissions(data.permissions?.[0] || null);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const hasAccess = (permission: keyof Permission): boolean => {
    if (!permissions) return false;
    if (user?.role === 'super_admin') return true; // Super Admin has all access
    return permissions[permission] === true;
  };

  const hasDepartmentAccess = (department: 'food' | 'parcel' | 'person'): boolean => {
    if (!permissions) return false;
    if (user?.role === 'super_admin') return true;
    
    switch (department) {
      case 'food':
        return permissions.canAccessFoodDepartment === true;
      case 'parcel':
        return permissions.canAccessParcelDepartment === true;
      case 'person':
        return permissions.canAccessPersonDepartment === true;
      default:
        return false;
    }
  };

  return {
    permissions,
    loading,
    hasAccess,
    hasDepartmentAccess,
    refetch: fetchPermissions,
  };
}

