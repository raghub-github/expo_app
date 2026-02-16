'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import Link from 'next/link';
import Image from 'next/image';
import AgentManagement from './AgentManagement';
import PermissionManagement from './PermissionManagement';
import ProfileSection from './ProfileSection';
import Sidebar from './Sidebar';
import BulkAccessUpdateModal from './BulkAccessUpdateModal';
import { fetchPendingApprovalUsers } from '@/lib/admin/pendingUsers';

export default function AdminDashboard() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [activeTab, setActiveTab] = useState<'agents' | 'permissions' | 'profile'>('agents');
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<{ id: string; email: string }[]>([]);

  useEffect(() => {
    if (user?.role === 'super_admin' && showBulkUpdate) {
      fetchPendingApprovalUsers().then(setPendingUsers);
    }
  }, [user, showBulkUpdate]);

  // Handle bulk update (replace with real API call)
  const handleBulkUpdate = useCallback((userIds: string[], permissions: Record<string, boolean>) => {
    // TODO: Call backend API to update permissions for all userIds
    // Example: await api.bulkUpdatePermissions(userIds, permissions)
    alert(`Bulk updated permissions for: ${userIds.join(', ')}\nPermissions: ${JSON.stringify(permissions)}`);
  }, []);

  // Show Bulk Update Modal handler for sidebar
  useEffect(() => {
    function openBulkUpdateModal() {
      setShowBulkUpdate(true);
    }
    window.addEventListener('openBulkUpdateModal', openBulkUpdateModal);
    return () => window.removeEventListener('openBulkUpdateModal', openBulkUpdateModal);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex">
      <Sidebar user={user} />
      {user?.role === 'super_admin' && (
        <BulkAccessUpdateModal
          isOpen={showBulkUpdate}
          onClose={() => setShowBulkUpdate(false)}
          pendingUsers={pendingUsers}
          onBulkUpdate={handleBulkUpdate}
        />
      )}
      <div className="flex-1 ml-72">
        {/* Top Navigation Bar */}
        <nav className="bg-white shadow-lg border-b border-gray-200 sticky top-0 z-30">
          <div className="px-8 py-6">
            <div className="flex justify-between items-center">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full"></div>
                  <h1 className="text-3xl font-bold text-gray-900">
                    Super Admin Dashboard
                  </h1>
                </div>
                <p className="text-sm text-gray-600">Manage agents, permissions, and access control</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-2">
                  <p className="text-xs text-emerald-700 uppercase tracking-wider font-medium">Welcome</p>
                  <p className="text-sm text-gray-900 font-semibold">{user?.email}</p>
                </div>
                <Link
                  href="/login"
                  className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 hover:text-red-800 rounded-lg transition-all border border-red-200 text-sm font-medium"
                >
                  Logout
                </Link>
              </div>
            </div>
          </div>
        </nav>

        <div className="p-8">
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-6 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-600 text-sm font-semibold uppercase tracking-wide">Total Agents</p>
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-xl text-emerald-600">
                  👤
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">24</p>
              <p className="text-xs text-gray-500 mt-2">+2 this week</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-600 text-sm font-semibold uppercase tracking-wide">Active Users</p>
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-xl text-emerald-600">
                  ✓
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">18</p>
              <p className="text-xs text-gray-500 mt-2">75% approval rate</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-600 text-sm font-semibold uppercase tracking-wide">Pending Approval</p>
                <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center text-xl text-amber-600">
                  ⏳
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">6</p>
              <p className="text-xs text-gray-500 mt-2">Awaiting review</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
              <div className="flex items-center justify-between mb-3">
                <p className="text-gray-600 text-sm font-semibold uppercase tracking-wide">Departments</p>
                <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center text-xl text-emerald-600">
                  🏢
                </div>
              </div>
              <p className="text-3xl font-bold text-gray-900">3</p>
              <p className="text-xs text-gray-500 mt-2">All active</p>
            </div>
          </div>

          {/* Main Content Panel */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-8">
            <div className="mb-8">
              <nav className="flex gap-2 border-b border-gray-200 pb-6">
                <button
                  onClick={() => setActiveTab('agents')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all uppercase text-xs tracking-wider ${
                    activeTab === 'agents'
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  Agent Management
                </button>
                <button
                  onClick={() => setActiveTab('permissions')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all uppercase text-xs tracking-wider ${
                    activeTab === 'permissions'
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  Permissions
                </button>
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`px-6 py-3 rounded-lg font-semibold transition-all uppercase text-xs tracking-wider ${
                    activeTab === 'profile'
                      ? 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md'
                      : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  Profile
                </button>
              </nav>
            </div>

            <div className="animate-fadeIn">
              {activeTab === 'agents' && <AgentManagement />}
              {activeTab === 'permissions' && <PermissionManagement />}
              {activeTab === 'profile' && <ProfileSection />}
            </div>
          </div>

          {/* Footer Stats */}
          <div className="mt-12 grid grid-cols-3 gap-6">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center text-xl text-emerald-600">
                  📊
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">System Status</p>
                  <p className="text-gray-900 font-bold text-lg">All Systems Operational</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center text-xl text-emerald-600">
                  🔐
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Security Level</p>
                  <p className="text-gray-900 font-bold text-lg">Premium Protection</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-lg flex items-center justify-center text-xl text-emerald-600">
                  ⚡
                </div>
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-wider font-medium">Last Updated</p>
                  <p className="text-gray-900 font-bold text-lg">Just now</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}