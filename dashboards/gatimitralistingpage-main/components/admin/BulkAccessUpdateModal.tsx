"use client";

import { useState, useEffect } from "react";

interface BulkAccessUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingUsers: { id: string; email: string }[];
  onBulkUpdate: (userIds: string[], permissions: Record<string, boolean>) => void;
}

const PERMISSIONS = [
  { key: "canAccessOrders", label: "Access Orders" },
  { key: "canAccessFoodDepartment", label: "Food Dashboard" },
  { key: "canAccessParcelDepartment", label: "Parcel Dashboard" },
  { key: "canAccessPersonDepartment", label: "Person Ride Dashboard" },
  { key: "canAccessOrderDetails", label: "Order Details" },
  { key: "canCreateRefund", label: "Create Refund" },
  { key: "canAccessCancellation", label: "Cancellation" },
  { key: "canManageAgents", label: "Manage Agents" },
  { key: "canManageDepartments", label: "Manage Departments" },
];

export default function BulkAccessUpdateModal({ isOpen, onClose, pendingUsers, onBulkUpdate }: BulkAccessUpdateModalProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setSelectedUserIds([]);
      setSelectedPermissions({});
    }
  }, [isOpen]);

  const handleUserSelect = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((uid) => uid !== id) : [...prev, id]
    );
  };

  const handlePermissionChange = (key: string) => {
    setSelectedPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleBulkUpdate = () => {
    if (selectedUserIds.length === 0) return;
    onBulkUpdate(selectedUserIds, selectedPermissions);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 min-w-[400px] max-w-[600px] w-full max-h-[85vh] overflow-hidden">
        <div className="flex justify-between items-center p-5 pb-3 border-b-2 border-emerald-500 bg-gradient-to-r from-emerald-50 to-white">
          <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <i className="bi bi-people-fill text-emerald-600"></i>
            <span>Bulk Access Update</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-lg p-1 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Close"
          >
            <i className="bi bi-x-lg"></i>
          </button>
        </div>
        <div className="p-5 overflow-y-auto max-h-[60vh]">
          <div className="mb-4">
            <div className="font-semibold mb-2">Select Users (Pending Approval):</div>
            <div className="space-y-2">
              {pendingUsers.length === 0 && <div className="text-gray-500">No pending users.</div>}
              {pendingUsers.map((user) => (
                <label key={user.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(user.id)}
                    onChange={() => handleUserSelect(user.id)}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-sm text-gray-800">{user.email}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <div className="font-semibold mb-2">Select Access Permissions:</div>
            <div className="grid grid-cols-2 gap-3">
              {PERMISSIONS.map((perm) => (
                <label key={perm.key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!selectedPermissions[perm.key]}
                    onChange={() => handlePermissionChange(perm.key)}
                    className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500"
                  />
                  <span className="text-xs text-gray-700">{perm.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={handleBulkUpdate}
            disabled={selectedUserIds.length === 0}
            className="px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-all duration-300 shadow-md hover:shadow-lg flex items-center gap-2 min-w-[120px] justify-center disabled:opacity-50"
          >
            <i className="bi bi-check-lg"></i>
            Bulk Update
          </button>
        </div>
      </div>
    </div>
  );
}
