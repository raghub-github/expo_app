'use client';

import { useState, useEffect, useRef } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { User } from '@/types';
import DashboardPreloader from './DashboardPreloader';

interface HeaderProps {
  user: User | null;
  sessionTime: { hours: number; minutes: number };
  onProfileClick: () => void;
  onLogoutClick: () => void;
  onDashboardTypeChange: (type: string) => void;
  onSearch: (type: string, value: string) => void;
  searchQuery: { type: string; value: string };
}


export default function Header({
  user,
  sessionTime,
  onProfileClick,
  onLogoutClick,
  onDashboardTypeChange,
  onSearch,
  searchQuery,
}: HeaderProps) {
  const { hasAccess } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [searchType, setSearchType] = useState('order_id');
  const [searchValue, setSearchValue] = useState('');
  const [showDashboardPreloader, setShowDashboardPreloader] = useState(false);
  const [preloaderDashboard, setPreloaderDashboard] = useState('');
  // ...existing code...
  const profileRef = useRef<HTMLDivElement>(null);

  // Detect current dashboard from pathname
  const getCurrentDashboard = () => {
    if (pathname?.includes('/parcel')) return 'Parcel';
    if (pathname?.includes('/person')) return 'Person';
    return 'Food';
  };

  const currentDashboard = getCurrentDashboard();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    if (showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfileMenu]);

  const handleSearch = () => {
    onSearch(searchType, searchValue);
  };

  const handleDashboardChange = (value: string) => {
    const dashboardNames: { [key: string]: string } = {
      Food: 'Food',
      Parcel: 'Parcel',
      Person: 'Person',
    };
    
    const routes: { [key: string]: string } = {
      Food: '/orders',
      Parcel: '/orders/parcel',
      Person: '/orders/person',
    };
    
    if (value !== 'Food') {
      setPreloaderDashboard(dashboardNames[value] || value);
      setShowDashboardPreloader(true);
      
      // Navigate after showing preloader
      const timer = setTimeout(() => {
        router.push(routes[value] || '/orders');
        setShowDashboardPreloader(false);
      }, 1500);
      
      return () => clearTimeout(timer);
    } else {
      router.push(routes[value] || '/orders');
    }
  };

  return (
    <header className="flex justify-between items-center mb-[25px] p-5 bg-white rounded-lg shadow-default border border-[#E2E8F0] flex-wrap gap-[15px]">
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-primary-mint to-primary-dark w-[46px] h-[46px] rounded-[10px] flex items-center justify-center text-white text-xl">
          <i className="fas fa-shipping-fast"></i>
        </div>
        <Image
          src="/img/logo.png"
          alt="GatiMitra"
          width={120}
          height={40}
          className="object-contain"
        />
        {/* Admin/Super Admin Button - visible only to users with access */}
        {hasAccess('canManageAgents') && (
          <button
            className="ml-4 px-4 py-2 bg-emerald-600 text-white font-semibold rounded-lg shadow hover:bg-emerald-700 transition-all flex items-center gap-2"
            onClick={() => router.push('/admin/dashboard')}
            aria-label="Admin Control"
          >
            <i className="bi bi-shield-lock"></i>
            Admin Control
          </button>
        )}
        {/* Removed Rider Log and Payment Card Details modal triggers */}
      </div>

      <div className="flex items-center gap-5 flex-wrap">
        {/* Search Box */}
        <div className="flex items-center bg-white border border-[#CBD5E1] rounded-md overflow-hidden min-w-[620px] transition-all focus-within:border-primary-mint focus-within:shadow-[0_0_0_3px_rgba(63,224,197,0.1)] relative mr-[10px]">
          <div className="relative bg-neutral-light border-r border-[#CBD5E1] min-w-[140px]">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              className="w-full border-none bg-transparent py-2.5 pl-4 pr-8 text-sm font-medium text-neutral-dark cursor-pointer appearance-none outline-none"
            >
              <option value="order_id">Order ID</option>
              <option value="merchant_id">Merchant ID</option>
              <option value="user_no">User Number</option>
              <option value="third_party_id">Third Party Order ID</option>
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-gray pointer-events-none">
              ▼
            </div>
          </div>
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search here..."
            className="flex-1 border-none py-2.5 px-4 text-sm text-neutral-dark outline-none min-w-[120px] placeholder:text-neutral-gray"
          />
          <button
            onClick={handleSearch}
            className="bg-primary-mint hover:bg-primary-dark text-neutral-dark hover:text-white py-2.5 px-[18px] text-sm font-semibold transition-all"
          >
            <i className="fas fa-search"></i>
          </button>
        </div>

        {/* Dashboard Type */}
        <div className="relative">
          <select
            value={currentDashboard}
            onChange={(e) => handleDashboardChange(e.target.value)}
            className="bg-white border border-[#CBD5E1] rounded-md py-2.5 pl-4 pr-10 text-sm font-medium text-neutral-dark appearance-none cursor-pointer transition-all min-w-[180px] w-full outline-none hover:border-primary-mint"
          >
            <option value="Food">Food Management</option>
            <option value="Parcel">Parcel Management</option>
            <option value="Person">Person Management</option>
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-neutral-gray pointer-events-none">
            ▼
          </div>
        </div>

        {/* Session Info */}
        <div className="flex items-center gap-3 bg-primary-light px-4 py-2.5 rounded-md text-sm font-semibold text-primary-dark border border-primary-mint/30 whitespace-nowrap">
          <i className="fas fa-clock"></i>
          <span>
            Session Time: {String(sessionTime.hours).padStart(2, '0')}h{' '}
            {String(sessionTime.minutes).padStart(2, '0')}m
          </span>
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="bg-gradient-to-br from-primary-mint to-primary-dark w-[46px] h-[46px] rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-105 shadow-default relative overflow-hidden"
          >
            <Image
              src={`https://i.pravatar.cc/150?img=32`}
              alt="User Profile"
              width={46}
              height={46}
              className="rounded-full object-cover"
            />
          </button>

          {showProfileMenu && (
            <div className="absolute top-full right-0 mt-2.5 bg-white rounded-lg shadow-hover min-w-[200px] z-[1000] border border-[#E2E8F0] py-2.5 animate-fadeIn">
              <div
                onClick={() => {
                  onProfileClick();
                  setShowProfileMenu(false);
                }}
                className="flex items-center gap-3 px-5 py-3 text-neutral-dark font-medium transition-all cursor-pointer hover:bg-primary-light hover:text-primary-dark"
              >
                <i className="fas fa-user w-5 text-neutral-gray"></i>
                <span>View Profile</span>
              </div>
              <div
                onClick={() => {
                  const event = new CustomEvent('openSessionReport');
                  window.dispatchEvent(event);
                  setShowProfileMenu(false);
                }}
                className="flex items-center gap-3 px-5 py-3 text-neutral-dark font-medium transition-all cursor-pointer hover:bg-primary-light hover:text-primary-dark"
              >
                <i className="fas fa-chart-line w-5 text-neutral-gray"></i>
                <span>Session Report</span>
              </div>
              <div className="h-px bg-[#E2E8F0] my-2"></div>
              <div
                onClick={() => {
                  onLogoutClick();
                  setShowProfileMenu(false);
                }}
                className="flex items-center gap-3 px-5 py-3 text-neutral-dark font-medium transition-all cursor-pointer hover:bg-primary-light hover:text-primary-dark"
              >
                <i className="fas fa-sign-out-alt w-5 text-neutral-gray"></i>
                <span>Logout</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <DashboardPreloader
        dashboardName={preloaderDashboard}
        isVisible={showDashboardPreloader}
      />
      {/* Removed Rider Log and Payment Card Details modals */}
    </header>
  );
}
