'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import Header from './Header';
import FilterSection from './FilterSection';
import StatusTabs from './StatusTabs';
import OrdersTable from './OrdersTable';
import SessionModal from './SessionModal';
import ProfileModal from './ProfileModal';
import LogoutModal from './LogoutModal';
import { Order } from '@/types';
import { startSessionTimer, getElapsedTime, formatDuration } from '@/lib/sessionService';

export default function OrdersDashboard() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'GM1011',
      orderId: 'GM1011',
      action: 'Verify Payment',
      routedTo: 'raghubhunia@gatimitra.in',
      orderTime: '18:12:25 11:30 AM',
      updatedTime: '18:12:25 11:35 AM',
      customerName: 'Rahul Sharma',
      customerMobile: '9876543210',
      merchantId: '8899002',
      merchantMobile: '91998877664',
      merchantLocality: 'South Delhi',
      deliveryProvider: 'GATIMITRA_DIRECT',
      status: 'PAYMENT DONE',
      category: 'Food',
      deliveryType: 'Merchant',
      userType: 'Very Good',
      department: 'food',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'GM1021',
      orderId: 'GM1021',
      action: 'Prepare Order',
      routedTo: 'davidwilson@gatimitra.in',
      orderTime: '18:12:25 03:45 PM',
      updatedTime: '18:12:25 03:50 PM',
      customerName: 'Priya Patel',
      customerMobile: '8765432109',
      merchantId: '3344557',
      merchantMobile: '91988776654',
      merchantLocality: 'West Mumbai',
      deliveryProvider: 'DELHIVERY',
      status: 'DESPATCH READY',
      category: 'Food',
      deliveryType: 'GatiMitra',
      userType: 'Good',
      department: 'food',
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 'GM1031',
      orderId: 'GM1031',
      action: 'Dispatch Order',
      routedTo: 'roberttaylor@gatimitra.in',
      orderTime: '18:12:25 05:20 PM',
      updatedTime: '18:12:25 05:25 PM',
      customerName: 'Ankit Verma',
      customerMobile: '7654321098',
      merchantId: '4455668',
      merchantMobile: '91977665543',
      merchantLocality: 'East Bangalore',
      deliveryProvider: 'BLUEDART',
      status: 'DESPATCHED',
      category: 'Food',
      deliveryType: 'Merchant',
      userType: 'Bad',
      department: 'food',
      createdAt: '',
      updatedAt: '',
    },
  ]);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('PAYMENT DONE');
  const [filters, setFilters] = useState({
    category: [] as string[],
    deliveryType: [] as string[],
    userType: [] as string[],
    department: 'food',
  });
  const [searchQuery, setSearchQuery] = useState({
    type: 'order_id',
    value: '',
  });
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [sessionTime, setSessionTime] = useState({ hours: 0, minutes: 0 });

  useEffect(() => {
    // Initialize session timer
    if (user) {
      startSessionTimer(user.id);
    }

    fetchOrders();
    
    // Update session time every minute
    const interval = setInterval(() => {
      const elapsed = getElapsedTime();
      const totalMinutes = Math.floor(elapsed / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setSessionTime({ hours, minutes });
    }, 60000);

    // Update immediately for first render
    const elapsed = getElapsedTime();
    const totalMinutes = Math.floor(elapsed / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    setSessionTime({ hours, minutes });
    
    // Listen for session report event
    const handleSessionReport = () => {
      setShowSessionModal(true);
    };
    window.addEventListener('openSessionReport', handleSessionReport);
    
    return () => {
      window.removeEventListener('openSessionReport', handleSessionReport);
      clearInterval(interval);
    };
  }, [user]);


  const fetchOrders = async () => {
    // For mock/demo, do not fetch from API, just use local state
    setLoading(false);
  };

  const [selectedFilters, setSelectedFilters] = useState({
    category: [] as string[],
    deliveryType: [] as string[],
    userType: [] as string[],
    department: filters.department,
  });

  const applyFilters = () => {
    // Move selected filters to applied filters
    setFilters({
      ...filters,
      category: selectedFilters.category,
      deliveryType: selectedFilters.deliveryType,
      userType: selectedFilters.userType,
      department: selectedFilters.department,
    });
  };

  useEffect(() => {
    let filtered = [...orders];

    // Apply status filter first
    filtered = filtered.filter((order) => order.status === selectedStatus);

    // Apply category filter
    if (filters.category.length > 0) {
      filtered = filtered.filter((order) =>
        filters.category.includes(order.category)
      );
    }

    // Apply delivery type filter
    if (filters.deliveryType.length > 0) {
      filtered = filtered.filter((order) =>
        filters.deliveryType.includes(order.deliveryType)
      );
    }

    // Apply user type filter
    if (filters.userType.length > 0) {
      filtered = filtered.filter((order) =>
        filters.userType.includes(order.userType)
      );
    }

    // Apply search query
    if (searchQuery.value) {
      const searchLower = searchQuery.value.toLowerCase();
      filtered = filtered.filter((order) => {
        switch (searchQuery.type) {
          case 'order_id':
            return order.orderId.toLowerCase().includes(searchLower);
          case 'merchant_id':
            return order.merchantId.toLowerCase().includes(searchLower);
          case 'user_no':
            return order.customerMobile.includes(searchQuery.value);
          case 'third_party_id':
            return order.orderId.toLowerCase().includes(searchLower);
          default:
            return true;
        }
      });
    }

    setFilteredOrders(filtered);
  }, [orders, filters, selectedStatus, searchQuery]);

  const handleStatusChange = (status: string) => {
    setSelectedStatus(status);
    fetchOrders();
  };

  const handleSearch = (type: string, value: string) => {
    setSearchQuery({ type, value });
  };

  const handleFilterChange = (filterType: string, value: string | string[]) => {
    // Update selected filters (not applied yet)
    setSelectedFilters((prev) => ({
      ...prev,
      [filterType]: Array.isArray(value) ? value : [value],
    }));
  };

  const clearFilters = () => {
    setSelectedFilters({
      category: [],
      deliveryType: [],
      userType: [],
      department: filters.department,
    });
    setFilters({
      category: [],
      deliveryType: [],
      userType: [],
      department: filters.department,
    });
    setSearchQuery({ type: 'order_id', value: '' });
  };

  return (
    <div className="max-w-full px-5 py-5 min-h-screen bg-[#F8FAFC]">
      <Header
        user={user}
        sessionTime={sessionTime}
        onProfileClick={() => setShowProfileModal(true)}
        onLogoutClick={() => setShowLogoutModal(true)}
        onDashboardTypeChange={(type) => {
          setFilters((prev) => ({ ...prev, department: type.toLowerCase() }));
          fetchOrders();
        }}
        onSearch={handleSearch}
        searchQuery={searchQuery}
      />

      <FilterSection
        filters={selectedFilters}
        onFilterChange={handleFilterChange}
        onApplyFilters={applyFilters}
        onClearFilters={clearFilters}
        searchQuery={searchQuery}
        onSearchClear={() => setSearchQuery({ type: 'order_id', value: '' })}
      />

      {/* Search Results Indicator */}
      {searchQuery.value && (
        <div className="bg-[#E0F2FE] border border-[#7DD3FC] text-[#0369A1] px-4 py-2 rounded-md mb-[15px] text-sm font-semibold flex items-center justify-between">
          <span>
            Showing search results for : <strong>{searchQuery.value}</strong>
          </span>
          <button
            onClick={() => setSearchQuery({ type: 'order_id', value: '' })}
            className="ml-4 bg-transparent border border-[#7DD3FC] text-[#0369A1] px-3 py-1 rounded text-xs transition-all hover:bg-[#BAE6FD]"
          >
            Clear Search
          </button>
        </div>
      )}

      <StatusTabs
        selectedStatus={selectedStatus}
        onStatusChange={handleStatusChange}
      />

      <OrdersTable
        orders={filteredOrders}
        loading={loading}
        status={selectedStatus}
        totalOrders={orders.filter((o) => o.status === selectedStatus).length}
        onRefresh={fetchOrders}
        onClearFilters={clearFilters}
      />

      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {showSessionModal && (
        <SessionModal
          onClose={() => setShowSessionModal(false)}
          onLogout={() => {
            setShowSessionModal(false);
            setShowLogoutModal(true);
          }}
        />
      )}

      {showLogoutModal && (
        <LogoutModal
          onClose={() => setShowLogoutModal(false)}
          onConfirm={() => {
            window.location.href = '/login';
          }}
        />
      )}
    </div>
  );
}

