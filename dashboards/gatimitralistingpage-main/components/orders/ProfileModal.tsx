'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';

interface ProfileModalProps {
  onClose: () => void;
}

export default function ProfileModal({ onClose }: ProfileModalProps) {
  const { user } = useSelector((state: RootState) => state.auth);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New password and confirm password do not match' });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters long' });
      return;
    }

    setLoading(true);

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
        setMessage({ type: 'error', text: 'Current password is incorrect' });
        setLoading(false);
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
        setMessage({ type: 'error', text: data.error || 'Failed to change password' });
        setLoading(false);
        return;
      }

      setMessage({ type: 'success', text: 'Password changed successfully! You can now login with your new password.' });
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setShowChangePassword(false);

      setTimeout(() => {
        setMessage(null);
      }, 5000);
    } catch (error) {
      console.error('Change password error:', error);
      setMessage({ type: 'error', text: 'An error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-xl shadow-hover w-[90%] max-w-[600px] max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-primary-light to-white">
          <h2 className="text-xl font-bold text-neutral-dark flex items-center gap-3">
            <i className="fas fa-user text-primary-dark text-xl"></i>
            Profile Settings
          </h2>
          <button
            onClick={onClose}
            className="text-xl text-neutral-gray hover:bg-neutral-light w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-8">
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-2">Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-neutral-gray"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-2">Name</label>
              <input
                type="text"
                value={user?.name || user?.email?.split('@')[0] || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-neutral-gray"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-dark mb-2">Role</label>
              <input
                type="text"
                value={user?.role || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-neutral-gray capitalize"
              />
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-neutral-dark">Change Password</h3>
                <p className="text-sm text-neutral-gray">Update your password to keep your account secure</p>
              </div>
              <button
                onClick={() => {
                  setShowChangePassword(!showChangePassword);
                  setMessage(null);
                  setPasswordData({
                    currentPassword: '',
                    newPassword: '',
                    confirmPassword: '',
                  });
                }}
                className="px-4 py-2 bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold rounded-lg transition-colors"
              >
                {showChangePassword ? 'Cancel' : 'Change Password'}
              </button>
            </div>

            {showChangePassword && (
              <form onSubmit={handleChangePassword} className="space-y-4 bg-gray-50 p-4 rounded-lg">
                {message && (
                  <div
                    className={`p-3 rounded-lg ${
                      message.type === 'success'
                        ? 'bg-green-50 border border-green-200 text-green-700'
                        : 'bg-red-50 border border-red-200 text-red-700'
                    }`}
                  >
                    {message.text}
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Updating Password...' : 'Update Password'}
                </button>
              </form>
            )}
          </div>

          <div className="flex gap-4 justify-end pt-6 border-t border-gray-200 mt-5">
            <button
              onClick={onClose}
              className="bg-neutral-light hover:bg-gray-200 text-neutral-dark font-semibold py-3 px-7 rounded-lg text-[15px] transition-colors flex items-center gap-2 border border-gray-300"
            >
              <i className="fas fa-times"></i>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}



