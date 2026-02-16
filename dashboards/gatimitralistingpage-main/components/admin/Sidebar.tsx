'use client';

import { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';

interface SidebarProps {
  user: any;
}



function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { hasAccess, hasDepartmentAccess } = usePermissions();
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);

  // Only show menu items the user has permission for
  const menuItems = [
    hasAccess('canManageDepartments') ? {
      title: 'Main Dashboard',
      icon: 'fas fa-home',
      href: '/admin/main-dashboard',
      active: pathname === '/admin/main-dashboard',
      description: 'Department Management',
    } : null,
    hasAccess('canManageAgents') ? {
      title: 'Agent Management',
      icon: 'fas fa-users-cog',
      href: '/admin/dashboard',
      active: pathname === '/admin/dashboard',
      description: 'Manage Agents & Roles',
    } : null,
    (hasDepartmentAccess('food') || hasDepartmentAccess('parcel') || hasDepartmentAccess('person')) ? {
      title: 'Orders Dashboard',
      icon: 'fas fa-clipboard-list',
      href: '/orders',
      active: pathname === '/orders',
      description: 'View All Orders',
    } : null,
  ].filter(Boolean) as Array<{
    title: string;
    icon: string;
    href: string;
    active: boolean;
    description: string;
  }>;

  return (
    <aside
      className={`bg-[#0B1220] text-gray-200 transition-all duration-300 ${
        isCollapsed ? 'w-20' : 'w-72'
      } min-h-screen fixed left-0 top-0 z-40 shadow-2xl border-r border-white/10`}
    >
      <div className="flex flex-col h-full">

        {/* Logo */}
        <div className="p-6 border-b border-white/10 bg-[#0F172A]">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <Image
                src="/img/logo.png"
                alt="GatiMitra"
                width={140}
                height={40}
                className="object-contain"
              />
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 rounded-lg hover:bg-white/10 transition"
            >
              <i className={`fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'} text-sm`} />
            </button>
          </div>
        </div>

        {/* User Info */}
        {!isCollapsed && (
          <div className="p-5 border-b border-white/10 bg-[#0F172A]">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold text-lg">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{user?.email}</p>
                <p className="text-xs text-gray-400 capitalize">
                  {user?.role?.replace('_', ' ')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Menu */}
        <nav className="flex-1 p-3 space-y-2 overflow-y-auto">
          {menuItems.map((item) => {
            if (!item) return null;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-4 p-4 rounded-xl transition-all ${
                  item.active
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'hover:bg-white/5 text-gray-300'
                }`}
              >
                <div
                  className={`p-2.5 rounded-lg ${
                    item.active
                      ? 'bg-white/20'
                      : 'bg-white/5 group-hover:bg-white/10'
                  }`}
                >
                  <i className={`${item.icon} text-lg`} />
                </div>

                {!isCollapsed && (
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-gray-400">{item.description}</p>
                  </div>
                )}

                {!isCollapsed && item.active && (
                  <i className="fas fa-chevron-right text-xs opacity-80" />
                )}
              </Link>
            );
          })}

          {/* Bulk Access Update - Only for Super Admin */}
          {user?.role === 'super_admin' && (
            <button
              className="w-full flex items-center gap-3 p-4 mt-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-700 text-white font-semibold shadow hover:from-emerald-600 hover:to-emerald-800 transition-all text-left"
              onClick={() => typeof window !== 'undefined' && window.dispatchEvent(new CustomEvent('openBulkUpdateModal'))}
            >
              <i className="bi bi-people-fill text-lg"></i>
              Bulk Access Update
            </button>
          )}
        </nav>

        {/* Footer */}
        {!isCollapsed && (
          <div className="p-5 border-t border-white/10 bg-[#0F172A]">
            <p className="text-xs text-center text-gray-400">
              © GatiMitra Admin Panel
            </p>
            <div className="flex justify-center items-center gap-2 mt-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-xs text-gray-300">System Online</span>
            </div>
          </div>
        )}

      </div>

      {/* Bulk update modal event is handled in AdminDashboard */}
    </aside>
  );
}

export default Sidebar;
