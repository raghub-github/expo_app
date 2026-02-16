'use client';

import { useState, useEffect } from 'react';
import { Permission, User } from '@/types';

export default function PermissionManagement() {
  const [permissions, setPermissions] = useState<(Permission & { user: User })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/permissions');
      const data = await response.json();
      // In a real app, you'd join with users table
      setPermissions(data.permissions || []);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePermission = async (
    userId: string,
    field: keyof Permission,
    value: boolean
  ) => {
    try {
      await fetch('/api/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          [field]: value,
        }),
      });
      fetchPermissions();
    } catch (error) {
      console.error('Error updating permission:', error);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-neutral-dark mb-6">Access Control</h2>
      <p className="text-neutral-gray mb-6">
        Control access to sensitive features for agents and users.
      </p>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-mint mx-auto"></div>
        </div>
      ) : permissions.length === 0 ? (
        <div className="text-center py-12 text-neutral-gray">
          No permissions found. Permissions are created automatically when users sign up.
        </div>
      ) : (
        <div className="space-y-4">
          {permissions.map((permission) => {
            const userInfo = permission.user && typeof permission.user === 'object' && !Array.isArray(permission.user)
              ? permission.user
              : null;
            return (
              <div
                key={permission.id}
                className="bg-neutral-light rounded-lg p-6 border border-gray-200"
              >
                <h3 className="font-semibold text-neutral-dark mb-4">
                  {userInfo && 'email' in userInfo
                    ? `${userInfo.email} (${userInfo.role || 'agent'})`
                    : `User ID: ${permission.userId}`}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-dark">Access Orders Page</span>
                    <button
                      onClick={() =>
                        updatePermission(
                          permission.userId,
                          'canAccessOrders',
                          !permission.canAccessOrders
                        )
                      }
                      className={`w-12 h-6 rounded-full relative transition-colors ${
                        permission.canAccessOrders ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          permission.canAccessOrders ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-dark">Create Refund</span>
                    <button
                      onClick={() =>
                        updatePermission(
                          permission.userId,
                          'canCreateRefund',
                          !permission.canCreateRefund
                        )
                      }
                      className={`w-12 h-6 rounded-full relative transition-colors ${
                        permission.canCreateRefund ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          permission.canCreateRefund ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-dark">Access Cancellation</span>
                    <button
                      onClick={() =>
                        updatePermission(
                          permission.userId,
                          'canAccessCancellation',
                          !permission.canAccessCancellation
                        )
                      }
                      className={`w-12 h-6 rounded-full relative transition-colors ${
                        permission.canAccessCancellation ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          permission.canAccessCancellation ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-neutral-dark">Manage Agents</span>
                    <button
                      onClick={() =>
                        updatePermission(
                          permission.userId,
                          'canManageAgents',
                          !permission.canManageAgents
                        )
                      }
                      className={`w-12 h-6 rounded-full relative transition-colors ${
                        permission.canManageAgents ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          permission.canManageAgents ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

