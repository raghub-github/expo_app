'use client';

import { useState, useEffect } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useDispatch } from 'react-redux';
import { setUser, setLoading } from '@/store/slices/authSlice';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [hasLastCredentials, setHasLastCredentials] = useState(false);
  // Check for last credentials on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setHasLastCredentials(!!localStorage.getItem('lastLoginCredentials'));
    }
  }, []);

  const { hasDepartmentAccess, refetch } = usePermissions();

  const redirectToDashboard = async (user: any) => {
    // Refetch permissions after login
    await refetch();
    // Wait a tick for permissions to update
    setTimeout(() => {
      const hasFood = hasDepartmentAccess('food');
      const hasParcel = hasDepartmentAccess('parcel');
      const hasPerson = hasDepartmentAccess('person');
      if (hasFood) {
        router.push('/orders'); // Assuming /orders is food dashboard
      } else if (hasParcel) {
        router.push('/orders/parcel');
      } else if (hasPerson) {
        router.push('/orders/person');
      } else {
        router.push('/unauthorized');
      }
    }, 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        setError('Server error: ' + (text.substring(0, 200) || 'Unknown error'));
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }

      dispatch(setUser(data.user));
      // Store user in localStorage for persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(data.user));
        if (rememberMe) {
          localStorage.setItem('lastLoginCredentials', JSON.stringify({ email, password }));
        } else {
          localStorage.removeItem('lastLoginCredentials');
        }
      }
      if (data.user.role === 'super_admin' || data.user.role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        redirectToDashboard(data.user);
      }
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err?.message || 'An error occurred. Please check your connection and try again.');
      setLoading(false);
    }
  };

  // Login with last credentials
  const handleLoginWithLastCredentials = async () => {
    if (typeof window === 'undefined') return;
    const creds = localStorage.getItem('lastLoginCredentials');
    if (!creds) return;
    try {
      const { email: lastEmail, password: lastPassword } = JSON.parse(creds);
      setLoading(true);
      setError('');
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lastEmail, password: lastPassword }),
      });
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        setError('Server error: ' + (text.substring(0, 200) || 'Unknown error'));
        setLoading(false);
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Login failed');
        setLoading(false);
        return;
      }
      dispatch(setUser(data.user));
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.user.role === 'super_admin' || data.user.role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        redirectToDashboard(data.user);
      }
    } catch (err: any) {
      setError('Failed to login with last credentials.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-light to-white p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <div className="flex justify-center mb-6">
          <Image
            src="/img/logo.png"
            alt="GatiMitra Logo"
            width={150}
            height={60}
            className="object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-center text-neutral-dark mb-6">
          Login to GatiMitra
        </h1>
        {/* Login with Last Credentials button */}
        {hasLastCredentials && (
          <button
            type="button"
            onClick={handleLoginWithLastCredentials}
            className="w-full mb-4 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-semibold py-2 px-4 rounded-lg transition-colors border border-emerald-200"
            style={{ marginBottom: '1rem' }}
          >
            <i className="bi bi-person-check mr-2"></i>
            Login with Last Credentials
          </button>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-neutral-dark mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border border-neutral-gray rounded-lg focus:ring-2 focus:ring-primary-mint focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-dark mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 pr-10 border border-neutral-gray rounded-lg focus:ring-2 focus:ring-primary-mint focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-gray hover:text-neutral-dark transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 3m3.29 3.29L12 12m-5.71-5.71L12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <div className="flex items-center mb-2">
            <input
              type="checkbox"
              id="rememberMe"
              checked={rememberMe}
              onChange={() => setRememberMe(!rememberMe)}
              className="mr-2"
            />
            <label htmlFor="rememberMe" className="text-sm text-neutral-dark cursor-pointer">
              Remember Me
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-neutral-gray">
          Don't have an account?{' '}
          <a href="/signup" className="text-primary-dark font-semibold hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

