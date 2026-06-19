'use client';

import ProtectedRoute from '@/components/ProtectedRoute';
import MainDashboard from '@/components/admin/MainDashboard';

export default function MainDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
      <MainDashboard />
    </ProtectedRoute>
  );
}

