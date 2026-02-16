"use client";

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import Header from './Header';

// Define the Order type/interface
interface Order {
  id: string;
  orderId: string;
  action: string;
  routedTo: string;
  orderTime: string;
  updatedTime: string;
  customerName: string;
  customerMobile: string;
  merchantId: string;
  merchantMobile: string;
  merchantLocality: string;
  deliveryProvider: string;
  status: string;
  category: string;
  deliveryType: string;
  userType: string;
  department: string;
  createdAt: string;
  updatedAt: string;
}

// Import your missing components
import FilterSection from './FilterSection';
import StatusTabs from './StatusTabs';
import OrdersTable from './OrdersTable';
import ProfileModal from './ProfileModal';
import SessionModal from './SessionModal';
import LogoutModal from './LogoutModal';

// Mock data with complete fields
export const mockPersonOrders: Order[] = [
  {
    id: 'PRD2001',
    orderId: 'PRD2001',
    action: 'Start Ride',
    routedTo: 'ride.coordinator@gatimitra.in',
    orderTime: '18:12:25 11:00 AM',
    updatedTime: '18:12:25 11:15 AM',
    customerName: 'Rajesh Kumar',
    customerMobile: '9988776655',
    merchantId: 'PERSON001',
    merchantMobile: '9199887766',
    merchantLocality: 'South Mumbai',
    deliveryProvider: 'GATIMITRA_RIDE',
    status: 'PAYMENT DONE',
    category: 'Person',
    deliveryType: 'Ride',
    userType: 'Standard',
    department: 'person',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'PRD2002',
    orderId: 'PRD2002',
    action: 'Complete Ride',
    routedTo: 'ride.manager@gatimitra.in',
    orderTime: '18:12:25 12:00 PM',
    updatedTime: '18:12:25 12:20 PM',
    customerName: 'Suman Joshi',
    customerMobile: '8877665544',
    merchantId: 'PERSON002',
    merchantMobile: '91988776655',
    merchantLocality: 'East Delhi',
    deliveryProvider: 'GATIMITRA_RIDE',
    status: 'DESPATCH READY',
    category: 'Person',
    deliveryType: 'Ride',
    userType: 'Premium',
    department: 'person',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'PRD2003',
    orderId: 'PRD2003',
    action: 'End Ride',
    routedTo: 'ride.support@gatimitra.in',
    orderTime: '18:12:25 02:00 PM',
    updatedTime: '18:12:25 02:30 PM',
    customerName: 'Meena Kumari',
    customerMobile: '7766554433',
    merchantId: 'PERSON003',
    merchantMobile: '91977665544',
    merchantLocality: 'North Mumbai',
    deliveryProvider: 'GATIMITRA_RIDE',
    status: 'DESPATCHED',
    category: 'Person',
    deliveryType: 'Ride',
    userType: 'Standard',
    department: 'person',
    createdAt: '',
    updatedAt: '',
  },
];

// Helper functions
const startSessionTimer = (userId: string) => {
  console.log('Starting session timer for user:', userId);
  // Implement your session timer logic here
};

const getElapsedTime = (): number => {
  // Return elapsed time in milliseconds
  // This is a placeholder - implement your actual logic
  return 0;
};

export default function PersonDashboard() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [orders, setOrders] = useState<Order[]>(mockPersonOrders);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('PAYMENT DONE');
  const [filters, setFilters] = useState({
    category: [] as string[],
    deliveryType: [] as string[],
    userType: [] as string[],
    department: 'person',
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
    if (user) {
      startSessionTimer(user.id);
    }
    fetchOrders();
    
    const interval = setInterval(() => {
      const elapsed = getElapsedTime();
      const totalMinutes = Math.floor(elapsed / 60000);
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      setSessionTime({ hours, minutes });
    }, 60000);
    
    const elapsed = getElapsedTime();
    const totalMinutes = Math.floor(elapsed / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    setSessionTime({ hours, minutes });
    
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
    setLoading(false);
  };

  const [selectedFilters, setSelectedFilters] = useState({
    category: [] as string[],
    deliveryType: [] as string[],
    userType: [] as string[],
    department: filters.department,
  });

  const applyFilters = () => {
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
    filtered = filtered.filter((order) => order.status === selectedStatus);
    
    if (filters.category.length > 0) {
      filtered = filtered.filter((order) =>
        filters.category.includes(order.category)
      );
    }
    
    if (filters.deliveryType.length > 0) {
      filtered = filtered.filter((order) =>
        filters.deliveryType.includes(order.deliveryType)
      );
    }
    
    if (filters.userType.length > 0) {
      filtered = filtered.filter((order) =>
        filters.userType.includes(order.userType)
      );
    }
    
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
    <div className="max-w-full px-5 py-5 min-h-screen bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
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

      {searchQuery.value && (
        <div className="bg-gradient-to-r from-indigo-100 to-purple-100 border border-indigo-300 text-indigo-800 px-4 py-3 rounded-lg mb-5 text-sm font-semibold flex items-center justify-between shadow-sm">
          <span>
            Showing search results for : <strong className="text-indigo-900">{searchQuery.value}</strong>
          </span>
          <button
            onClick={() => setSearchQuery({ type: 'order_id', value: '' })}
            className="ml-4 bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-md text-xs transition-all hover:bg-indigo-50 hover:border-indigo-400 hover:text-indigo-800 shadow-sm"
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