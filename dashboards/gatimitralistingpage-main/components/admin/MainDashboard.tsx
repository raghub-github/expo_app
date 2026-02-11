'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import Link from 'next/link';
import Image from 'next/image';
import { Department } from '@/types';
import Sidebar from './Sidebar';

export default function MainDashboard() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/departments');
      const data = await response.json();
      setDepartments(data.departments || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDepartment = async (departmentId: string, isEnabled: boolean) => {
    try {
      const response = await fetch('/api/departments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: departmentId,
          isEnabled: !isEnabled,
          enabledBy: user?.id,
        }),
      });

      if (response.ok) {
        fetchDepartments();
      }
    } catch (error) {
      console.error('Error toggling department:', error);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New password and confirm password do not match' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters long' });
      return;
    }

    setPasswordLoading(true);

    try {
      // First verify current password by attempting login
      const verifyResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user?.email,
          password: passwordData.currentPassword,
        }),
      });

      if (!verifyResponse.ok) {
        setPasswordMessage({ type: 'error', text: 'Current password is incorrect' });
        setPasswordLoading(false);
        return;
      }

      // Update password
      const updateResponse = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          newPassword: passwordData.newPassword,
        }),
      });

      const data = await updateResponse.json();

      if (!updateResponse.ok) {
        setPasswordMessage({ type: 'error', text: data.error || 'Failed to change password' });
        setPasswordLoading(false);
        return;
      }

      setPasswordMessage({ type: 'success', text: 'Password changed successfully! You can now login with your new password.' });
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setShowChangePassword(false);

      setTimeout(() => {
        setPasswordMessage(null);
      }, 5000);
    } catch (error) {
      console.error('Change password error:', error);
      setPasswordMessage({ type: 'error', text: 'An error occurred. Please try again.' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar user={user} />
      
      <div className="flex-1 ml-72">
        {/* Top Navigation Bar */}
        <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-neutral-dark">GatiMitra Main Dashboard</h1>
                <p className="text-sm text-neutral-gray mt-1">Manage department access for all users</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-neutral-gray">Welcome, {user?.email}</span>
                <div className="relative">
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="bg-gradient-to-br from-primary-mint to-primary-dark w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-default hover:scale-105 transition-transform"
                  >
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </button>
                  {showProfileMenu && (
                    <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-lg min-w-[200px] z-50 border border-gray-200 py-2">
                      <div
                        onClick={() => {
                          setShowProfileMenu(false);
                          setShowChangePassword(true);
                        }}
                        className="flex items-center gap-3 px-5 py-3 text-neutral-dark font-medium transition-colors cursor-pointer hover:bg-primary-light hover:text-primary-dark"
                      >
                        <i className="fas fa-key w-5 text-neutral-gray"></i>
                        <span>Change Password</span>
                      </div>
                      <div className="h-px bg-gray-200 my-2"></div>
                      <div
                        onClick={() => {
                          localStorage.removeItem('user');
                          window.location.href = '/login';
                        }}
                        className="flex items-center gap-3 px-5 py-3 text-neutral-dark font-medium transition-colors cursor-pointer hover:bg-primary-light hover:text-primary-dark"
                      >
                        <i className="fas fa-sign-out-alt w-5 text-neutral-gray"></i>
                        <span>Logout</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <div className="p-8">
          <div className="bg-white rounded-xl shadow-default p-8">
            {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-mint mx-auto"></div>
              <p className="mt-4 text-neutral-gray">Loading departments...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className={`border-2 rounded-xl p-6 transition-all ${
                    dept.isEnabled
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-neutral-dark capitalize">
                      {dept.name}
                    </h3>
                    <div
                      className={`w-12 h-6 rounded-full relative transition-colors ${
                        dept.isEnabled ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    >
                      <button
                        onClick={() => toggleDepartment(dept.id, dept.isEnabled)}
                        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                          dept.isEnabled ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-neutral-gray mb-2">
                    Status: {dept.isEnabled ? 'Enabled' : 'Disabled'}
                  </p>
                  {dept.isEnabled && dept.enabledAt && (
                    <p className="text-xs text-neutral-gray">
                      Enabled on: {new Date(dept.enabledAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

            <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Note:</strong> When a department is disabled, no user will be able to access
                that department's dashboard until it is enabled again by Super Admin.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-lg w-[90%] max-w-[500px]">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-primary-light to-white">
              <h2 className="text-xl font-bold text-neutral-dark flex items-center gap-3">
                <i className="fas fa-key text-primary-dark text-xl"></i>
                Change Password
              </h2>
              <button
                onClick={() => {
                  setShowChangePassword(false);
                  setPasswordMessage(null);
                  setPasswordData({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: '',
                  });
                }}
                className="text-xl text-neutral-gray hover:bg-neutral-light w-9 h-9 rounded-full flex items-center justify-center transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleChangePassword} className="space-y-4">
                {passwordMessage && (
                  <div
                    className={`p-3 rounded-lg ${
                      passwordMessage.type === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    {passwordMessage.text}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-neutral-dark mb-2">
                    Current Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, currentPassword: e.target.value })
                    }
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-mint focus:border-transparent"
                    placeholder="Enter your current password"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-dark mb-2">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, newPassword: e.target.value })
                    }
                    required
                    minLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-mint focus:border-transparent"
                    placeholder="Enter new password (min 6 characters)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-dark mb-2">
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                    }
                    required
                    minLength={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-mint focus:border-transparent"
                    placeholder="Confirm new password"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowChangePassword(false);
                      setPasswordMessage(null);
                      setPasswordData({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: '',
                      });
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-neutral-dark font-semibold hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    className="px-4 py-2 bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {passwordLoading ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

