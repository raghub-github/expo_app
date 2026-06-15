'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import ProtectedRoute from '@/components/ProtectedRoute';
import OrdersDashboard from '@/components/orders/OrdersDashboard';
import { usePermissions } from '@/hooks/usePermissions';


function OrdersPageContent() {
  const router = useRouter();
  const { user } = useSelector((state: RootState) => state.auth);
  const { hasAccess, hasDepartmentAccess, loading } = usePermissions();

  useEffect(() => {
    if (!loading && user) {
      const food = hasDepartmentAccess('food');
      const parcel = hasDepartmentAccess('parcel');
      const person = hasDepartmentAccess('person');
      const permitted = [food, parcel, person].filter(Boolean).length;

      if (!food && !parcel && !person && user.role !== 'super_admin' && user.role !== 'admin') {
        router.push('/pending-approval');
        return;
      }

      // Redirect logic after login
      if (typeof window !== 'undefined' && window.location.pathname === '/orders') {
        if (permitted === 1) {
          if (food) router.replace('/orders');
          else if (parcel) router.replace('/orders/parcel');
          else if (person) router.replace('/orders/person');
        } else if (permitted === 3) {
          router.replace('/orders'); // Default to Food
        }
      }
    }
  }, [loading, hasAccess, hasDepartmentAccess, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-mint mx-auto"></div>
          <p className="mt-4 text-neutral-gray">Checking permissions...</p>
        </div>
      </div>
    );
  }

  return <OrdersDashboard />;
}

export default function OrdersPage() {
  return (
    <ProtectedRoute allowedRoles={['agent', 'admin', 'super_admin']} requireApproval={true}>
      <OrdersPageContent />
    </ProtectedRoute>
  );
}


