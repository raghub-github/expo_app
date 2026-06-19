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

// Import your missing components (make sure these exist)
import FilterSection from './FilterSection';
import StatusTabs from './StatusTabs';
import OrdersTable from './OrdersTable';
import ProfileModal from './ProfileModal';
import SessionModal from './SessionModal';
import LogoutModal from './LogoutModal';

// Mock data
export const mockParcelOrders: Order[] = [
  {
    id: 'PCL1001',
    orderId: 'PCL1001',
    action: 'Pickup Parcel',
    routedTo: 'john.doe@gatimitra.in',
    orderTime: '18:12:25 09:00 AM',
    updatedTime: '18:12:25 09:10 AM',
    customerName: 'Amit Singh',
    customerMobile: '9123456789',
    merchantId: 'PARCEL001',
    merchantMobile: '91987654321',
    merchantLocality: 'Central Delhi',
    deliveryProvider: 'GATIMITRA_DIRECT',
    status: 'PAYMENT DONE',
    category: 'Parcel',
    deliveryType: 'Courier',
    userType: 'Standard',
    department: 'parcel',
    createdAt: '',
    updatedAt: '',
  },
  // ... rest of the mock data remains the same
  {
    id: 'PCL1002',
    orderId: 'PCL1002',
    action: 'Dispatch Parcel',
    routedTo: 'jane.smith@gatimitra.in',
    orderTime: '18:12:25 10:30 AM',
    updatedTime: '18:12:25 10:45 AM',
    customerName: 'Neha Gupta',
    customerMobile: '9876543210',
    merchantId: 'PARCEL002',
    merchantMobile: '91912345678',
    merchantLocality: 'North Delhi',
    deliveryProvider: 'BLUEDART',
    status: 'DESPATCH READY',
    category: 'Parcel',
    deliveryType: 'Courier',
    userType: 'Premium',
    department: 'parcel',
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'PCL1003',
    orderId: 'PCL1003',
    action: 'Deliver Parcel',
    routedTo: 'alex.fernandez@gatimitra.in',
    orderTime: '18:12:25 11:00 AM',
    updatedTime: '18:12:25 11:20 AM',
    customerName: 'Sunil Mehra',
    customerMobile: '9988776655',
    merchantId: 'PARCEL003',
    merchantMobile: '91999887766',
    merchantLocality: 'West Delhi',
    deliveryProvider: 'DELHIVERY',
    status: 'DESPATCHED',
    category: 'Parcel',
    deliveryType: 'Courier',
    userType: 'Standard',
    department: 'parcel',
    createdAt: '',
    updatedAt: '',
  },
];

// Helper functions (you need to define or import these)
const startSessionTimer = (userId: string) => {
  // Implement your session timer logic here
  console.log('Starting session timer for user:', userId);
};

const getElapsedTime = (): number => {
  // Return elapsed time in milliseconds
  // This is a placeholder - implement your actual logic
  return 0;
};

export default function ParcelDashboard() {
  const { user } = useSelector((state: RootState) => state.auth);
  const [orders, setOrders] = useState<Order[]>(mockParcelOrders);
  const [filteredOrders, setFilteredOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('PAYMENT DONE');
  const [filters, setFilters] = useState({
    category: [] as string[],
    deliveryType: [] as string[],
    userType: [] as string[],
    department: 'parcel',
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