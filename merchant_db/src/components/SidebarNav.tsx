"use client";
import React, { useState } from 'react';
import { Home, Store, Users, BarChart2, CreditCard, UserCheck, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
const WarningModal = dynamic(() => import('./WarningModal'), { ssr: false });
import WarningImage from './WarningImage';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: <Home size={20} /> },
  { label: 'Stores', href: '/admin/stores', icon: <Store size={20} /> },
  { label: 'Verifications', href: '/admin/verifications', icon: <UserCheck size={20} /> },
  { label: 'Withdrawals', href: '/admin/withdrawals', icon: <CreditCard size={20} /> },
  { label: 'Analytics', href: '/admin/analytics', icon: <BarChart2 size={20} /> },
  { label: 'Area Managers', href: '/admin/managers', icon: <Users size={20} /> },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);

  const handleLogout = () => {
    setShowModal(true);
  };

  const handleConfirmLogout = () => {
    setShowModal(false);
    // Optionally clear session here
    router.push('/');
  };

  return (
    <nav className="flex flex-col gap-2 relative">
      {navItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors
              ${isActive ? 'bg-blue-100 text-blue-700 font-bold shadow' : 'text-gray-800 hover:bg-gray-100'}`}
            style={isActive ? { borderLeft: '4px solid #2563eb', background: '#e0e7ff' } : {}}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
      <div className="flex-1" />
      <button
        className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-500 font-medium hover:bg-gray-100 transition-colors mt-8"
        onClick={handleLogout}
      >
        <LogOut size={20} />
        Logout
      </button>
      {/* Modal as child of nav (centered over content) */}
      {showModal && (
        <WarningModal
          open={showModal}
          onClose={() => setShowModal(false)}
          onConfirm={handleConfirmLogout}
        >
          <WarningImage />
        </WarningModal>
      )}
    </nav>
  );
}
