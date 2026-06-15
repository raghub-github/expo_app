'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import ProtectedRoute from '@/components/ProtectedRoute';
import OrderDetails from '@/components/orders/OrderDetails';
import { Order } from '@/types';
import { usePermissions } from '@/hooks/usePermissions';

function OrderDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const { user } = useSelector((state: RootState) => state.auth);
  const { hasAccess, loading: permissionsLoading } = usePermissions();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      fetchOrder(params.id as string);
    }
  }, [params.id]);

  useEffect(() => {
    if (!permissionsLoading && user) {
      // Check if user has access to Order Details page
      const hasOrderDetailsAccess = 
        hasAccess('canAccessOrderDetails') ||
        user.role === 'super_admin' ||
        user.role === 'admin';

      if (!hasOrderDetailsAccess) {
        router.push('/pending-approval');
      }
    }
  }, [permissionsLoading, hasAccess, user, router]);

  const fetchOrder = async (id: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/orders/${id}`);
      const data = await response.json();
      setOrder(data.order);
    } catch (error) {
      console.error('Error fetching order:', error);
    } finally {
      setLoading(false);
    }
  };

  if (permissionsLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-mint"></div>
          <p className="mt-4 text-neutral-gray">Loading...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-neutral-gray">Order not found</p>
      </div>
    );
  }

  return <OrderDetails order={order} onUpdate={fetchOrder} />;
}

export default function OrderDetailPage() {
  return (
    <ProtectedRoute allowedRoles={['agent', 'admin', 'super_admin']} requireApproval={true}>
      <OrderDetailPageContent />
    </ProtectedRoute>
  );
}


