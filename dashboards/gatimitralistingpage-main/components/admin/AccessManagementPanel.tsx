'use client';

import { useState, useEffect } from 'react';
import { Permission } from '@/types';

interface AccessManagementPanelProps {
  userId: string;
  userEmail: string;
  agentId?: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function AccessManagementPanel({
  userId,
  userEmail,
  agentId,
  onClose,
  onUpdate,
}: AccessManagementPanelProps) {
  const [permissions, setPermissions] = useState<Permission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPermissions();
  }, [userId]);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/permissions?userId=${userId}`);
      const data = await response.json();
      setPermissions(data.permissions?.[0] || null);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePermission = async (field: keyof Permission, value: boolean) => {
    try {
      setSaving(true);
      const response = await fetch('/api/permissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          [field]: value,
        }),
      });

      if (response.ok) {
        await fetchPermissions();
        onUpdate();
      }
    } catch (error) {
      console.error('Error updating permission:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleAccess = (field: keyof Permission) => {
    if (!permissions) return;
    const currentValue = permissions[field] as boolean;
    updatePermission(field, !currentValue);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-mint mx-auto"></div>
            <p className="mt-4 text-neutral-gray">Loading access permissions...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-primary-light to-white sticky top-0 z-10">
          <div>
            <h2 className="text-2xl font-bold text-neutral-dark flex items-center gap-3">
              <i className="fas fa-shield-alt text-primary-dark text-xl"></i>
              Access Management
            </h2>
            <p className="text-sm text-neutral-gray mt-1">
              {agentId && `Agent ID: ${agentId} • `}
              {userEmail}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-xl text-neutral-gray hover:bg-neutral-light w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="p-6">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-neutral-dark mb-2">Orders Dashboard Access</h3>
            <p className="text-sm text-neutral-gray mb-4">
              Control access to different department dashboards within the Orders page
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <i className="fas fa-utensils text-orange-500 text-lg"></i>
                  <div>
                    <div className="font-semibold text-neutral-dark">Food Management Dashboard</div>
                    <div className="text-xs text-neutral-gray">Access to Food department orders</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleAccess('canAccessFoodDepartment')}
                  disabled={saving}
                  className={`w-14 h-7 rounded-full relative transition-colors ${
                    permissions?.canAccessFoodDepartment ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                      permissions?.canAccessFoodDepartment ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <i className="fas fa-box text-blue-500 text-lg"></i>
                  <div>
                    <div className="font-semibold text-neutral-dark">Parcel Management Dashboard</div>
                    <div className="text-xs text-neutral-gray">Access to Parcel department orders</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleAccess('canAccessParcelDepartment')}
                  disabled={saving}
                  className={`w-14 h-7 rounded-full relative transition-colors ${
                    permissions?.canAccessParcelDepartment ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                      permissions?.canAccessParcelDepartment ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <i className="fas fa-user-friends text-purple-500 text-lg"></i>
                  <div>
                    <div className="font-semibold text-neutral-dark">Person Ride Management Dashboard</div>
                    <div className="text-xs text-neutral-gray">Access to Person Ride department orders</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleAccess('canAccessPersonDepartment')}
                  disabled={saving}
                  className={`w-14 h-7 rounded-full relative transition-colors ${
                    permissions?.canAccessPersonDepartment ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                      permissions?.canAccessPersonDepartment ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-neutral-dark mb-2">Order Details Page</h3>
            <p className="text-sm text-neutral-gray mb-4">
              Allow access to view and manage individual order details
            </p>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <i className="fas fa-file-invoice text-green-500 text-lg"></i>
                <div>
                  <div className="font-semibold text-neutral-dark">Order Details Page</div>
                  <div className="text-xs text-neutral-gray">Access to view and edit order details</div>
                </div>
              </div>
              <button
                onClick={() => toggleAccess('canAccessOrderDetails')}
                disabled={saving}
                className={`w-14 h-7 rounded-full relative transition-colors ${
                  permissions?.canAccessOrderDetails ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                    permissions?.canAccessOrderDetails ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-semibold text-neutral-dark mb-2">Additional Permissions</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <i className="fas fa-undo text-red-500 text-lg"></i>
                  <div>
                    <div className="font-semibold text-neutral-dark">Create Refund</div>
                    <div className="text-xs text-neutral-gray">Ability to create refunds for orders</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleAccess('canCreateRefund')}
                  disabled={saving}
                  className={`w-14 h-7 rounded-full relative transition-colors ${
                    permissions?.canCreateRefund ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                      permissions?.canCreateRefund ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-3">
                  <i className="fas fa-ban text-orange-500 text-lg"></i>
                  <div>
                    <div className="font-semibold text-neutral-dark">Access Cancellation</div>
                    <div className="text-xs text-neutral-gray">Ability to cancel orders</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleAccess('canAccessCancellation')}
                  disabled={saving}
                  className={`w-14 h-7 rounded-full relative transition-colors ${
                    permissions?.canAccessCancellation ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                      permissions?.canAccessCancellation ? 'translate-x-7' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Users can only access features for which they have been granted permission. 
              Without explicit access, they will be redirected to the pending approval page.
            </p>
          </div>

          <div className="flex gap-3 justify-end mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-neutral-dark font-semibold hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


