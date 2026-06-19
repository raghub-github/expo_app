'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '@/store/store';
import { setUser, setLoading } from '@/store/slices/authSlice';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('super_admin' | 'admin' | 'agent')[];
  requireApproval?: boolean;
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  requireApproval = true,
}: ProtectedRouteProps) {
  const router = useRouter();
  const dispatch = useDispatch();
  const { user, isAuthenticated, isLoading } = useSelector(
    (state: RootState) => state.auth
  );
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize auth state from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && !isInitialized) {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const userData = JSON.parse(storedUser);
          dispatch(setUser(userData));
          dispatch(setLoading(false));
        } catch (error) {
          localStorage.removeItem('user');
          dispatch(setLoading(false));
        }
      } else {
        dispatch(setLoading(false));
      }
      setIsInitialized(true);
    }
  }, [dispatch, isInitialized]);

  useEffect(() => {
    if (isInitialized && !isLoading) {
      if (!isAuthenticated || !user) {
        router.push('/login');
        return;
      }

      if (requireApproval && user.role === 'agent' && !user.isApproved) {
        router.push('/pending-approval');
        return;
      }

      if (allowedRoles && !allowedRoles.includes(user.role)) {
        router.push('/unauthorized');
        return;
      }
    }
  }, [isAuthenticated, user, isLoading, router, allowedRoles, requireApproval, isInitialized]);

  if (isLoading || !isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-mint mx-auto"></div>
          <p className="mt-4 text-neutral-gray">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (requireApproval && user.role === 'agent' && !user.isApproved) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}

