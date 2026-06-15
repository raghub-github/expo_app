'use client';

import { useState, useEffect, useCallback } from 'react';
import { Order, OrderStatus } from '@/types';
import OrderDetailsHeader from './OrderDetailsHeader';
import OrderMetadata from './OrderMetadata';
import OrderStatusBlock from './OrderStatusBlock';
import OrderTimeline from './OrderTimeline';
import CustomerDetails from './CustomerDetails';
import MerchantDetails from './MerchantDetails';
import PaymentDetails, { PaymentDetailsModal } from './PaymentDetails';
import RiderDetails, { RiderLogModal } from './RiderDetails';
import RightSidebar from './RightSidebar';
import ItemsRefundModal from './ItemsRefundModal';
import PhoneModal from './PhoneModal';
import MerchantContactsModal from './MerchantContactsModal';
import StoreTimingModal from './StoreTimingModal';
import StoreDetailsModal from './StoreDetailsModal';
import RemarksModal, { Remark } from './RemarksModal';
import { Remark as RightSidebarRemark, Recon, Notification } from './RightSidebar';
import ReconModal from './ReconModal';
import NotificationModal from './NotificationModal';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';

interface PhoneModalData {
  title: string;
  phone: string;
}

export default function OrderDetails({ 
  order, 
  onUpdate 
}: { 
  order: Order; 
  onUpdate: () => void 
}) {
  const user = useSelector((state: RootState) => state.auth.user);
  
  // Modal states
  const [showItemsModal, setShowItemsModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showMerchantContacts, setShowMerchantContacts] = useState(false);
  const [showStoreTimingModal, setShowStoreTimingModal] = useState(false);
  const [showStoreDetailsModal, setShowStoreDetailsModal] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [showReconsModal, setShowReconsModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showRiderLogModal, setShowRiderLogModal] = useState(false);
  const [showPaymentDetailsModal, setShowPaymentDetailsModal] = useState(false);
  
  // Data states
  const [phoneModalData, setPhoneModalData] = useState<PhoneModalData | null>(null);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [recons, setRecons] = useState<Recon[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [remarks, setRemarks] = useState<Remark[]>([
    {
      id: '1',
      type: 'RIDER',
      content: "Rider is waiting at the store for the parcel. Mx is preparing the order. !!!!! +919373865361",
      time: '19-12-25 06:11 PM',
      user: 'Agent',
      userType: 'Agent',
      agentEmail: user?.email || 'agent@gatimitra.in',
      isEdited: false,
    },
    {
      id: '2',
      type: 'CUSTOMER',
      content: 'Name: Pranjal Gupta Mobile: +919096584185 inform Cx about the order status',
      time: '19-12-25 06:09 PM',
      user: 'Customer Service',
      userType: 'Customer',
      agentId: user?.id || '2',
      agentEmail: user?.email || 'agent@gatimitra.in',
      isEdited: false,
    }
  ]);

  // Toast helper
  const showToast = useCallback((message: string, duration = 3000) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(''), duration);
  }, []);

  // Copy to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`Copied to clipboard: ${text}`);
    }).catch(() => {
      showToast('Failed to copy text');
    });
  }, [showToast]);

  // Handle phone click
  const handlePhoneClick = useCallback((title: string, phone: string) => {
    setPhoneModalData({ title, phone });
    setShowPhoneModal(true);
  }, []);

  // Update remark
  const handleUpdateRemark = useCallback((remarkId: string, newContent: string) => {
    setRemarks(prev => prev.map(remark => {
      if (remark.id === remarkId && !remark.isEdited) {
        const now = new Date();
        const formattedDate = now.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit'
        }).replace(/\//g, '-');
        
        const formattedTime = now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });
        
        const editedTimeStr = `${formattedDate} ${formattedTime}`;
        
        return {
          ...remark,
          content: newContent,
          isEdited: true,
          editedTime: editedTimeStr,
          editHistory: {
            oldContent: remark.content,
            newContent,
            editedBy: user?.email || 'Agent',
            editedAt: editedTimeStr,
          },
        };
      }
      return remark;
    }));
    
    showToast('Remark updated successfully');
  }, [user?.email, showToast]);

  // Update order status
  const handleStatusUpdate = useCallback(async (status: OrderStatus | 'Dispatch Ready') => {
    try {
      // Map UI status to database status
      let dbStatus: OrderStatus = status as OrderStatus;
      if (status === 'Dispatch Ready') {
        dbStatus = 'DESPATCH READY';
      } else if (status === 'DESPATCHED' || status === 'PAYMENT DONE') {
        dbStatus = 'Delivered';
      }

      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token || ''}`
        },
        body: JSON.stringify({ status: dbStatus }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Update localStorage with the new status from database
      localStorage.setItem(`order-${order.id}-status`, dbStatus);
      
      // Refresh order data from database
      onUpdate();
      
      // Show toast only for Delivered or Cancelled status
      if (dbStatus === 'Delivered' || dbStatus === 'Cancelled') {
        showToast(`Order status updated to ${dbStatus}`);
      }
    } catch (error) {
      console.error('Error updating status:', error);
      showToast('Failed to update status');
    }
  }, [order.id, onUpdate, showToast, user?.token]);

  // ESC key handler to close all modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowItemsModal(false);
        setShowPhoneModal(false);
        setShowMerchantContacts(false);
        setShowRemarksModal(false);
        setShowReconsModal(false);
        setShowNotificationsModal(false);
        setShowStoreTimingModal(false);
        setShowStoreDetailsModal(false);
        setShowRiderLogModal(false);
        setShowPaymentDetailsModal(false);
        setPhoneModalData(null);
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Merge order data with defaults
  const orderWithDefaults: Order = {
    ...order,
    orderId: order.orderId || 'GM1001',
    updatedTime: order.updatedTime || '19-12-25 08:25 AM',
    routedTo: order.routedTo || 'raghubhunia@gatimitra.in',
    customerName: order.customerName || 'Amarjeet Singh',
    customerMobile: order.customerMobile || '+919810223744',
    customerEmail: order.customerEmail || 'Lalsonsfurnishers@gmail.com',
    customerAddress: order.customerAddress || 'G 67 4th floor, South city 1 sector 41, Sector 41 Sector 41, Gurugram - 122007',
    customerLatLon: order.customerLatLon || '28.456007, 77.064804',
    userType: order.userType || 'VERY_GOOD',
    merchantId: order.merchantId || '75229',
    merchantMobile: order.merchantMobile || '+918527497520',
    merchantLocality: order.merchantLocality || 'HITTO BA-GABA & BIRYAN',
    parentMerchantId: order.parentMerchantId || '2186704',
    parentMerchantName: order.parentMerchantName || 'Om Sweets and Snacks',
    merchantUserId: order.merchantUserId || '280944',
    deliveryProvider: order.deliveryProvider || 'SHIPROCKET_DIRECT',
    category: order.category || 'Catalog',
    status: order.status || 'Delivered',
    riderProvider: order.riderProvider || 'Shiprocket_direct',
    riderName: order.riderName || 'Ram Yadav',
    riderMobile: order.riderMobile || '+917761970466',
    trackingOrderId: order.trackingOrderId || '1086718138',
    trackingUrl: order.trackingUrl || 'https://shiprocket.co/tracking/694dc2da2952783cc6cb2e28',
    otp: order.otp || '7221',
  };

  // Handle modal close for phone modal
  const handlePhoneModalClose = useCallback(() => {
    setShowPhoneModal(false);
    setPhoneModalData(null);
  }, []);

  // Check if any full-page modal is open (needs blur effect)
  const isFullPageModalOpen = showRiderLogModal || showPaymentDetailsModal;

  return (
    <div className="font-['Roboto',sans-serif] bg-gati-background text-gati-text-primary leading-normal">
      {/* Blur overlay when full-page modal is open */}
      {isFullPageModalOpen && (
        <div 
          className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm" 
          onClick={() => {
            setShowRiderLogModal(false);
            setShowPaymentDetailsModal(false);
          }} 
        />
      )}
      
      <div className={isFullPageModalOpen ? 'filter blur-sm pointer-events-none' : ''}>
        <OrderDetailsHeader />
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-gati-primary text-white px-5 py-3 rounded-sm shadow-[0_4px_12px_rgba(0,0,0,0.15)] z-[10000] animate-[slideIn_0.3s_ease] text-sm font-medium">
          {toastMessage}
        </div>
      )}

      <div className={`flex min-h-[calc(100vh-60px)] relative ${isFullPageModalOpen ? 'filter blur-sm pointer-events-none' : ''}`}>
        {/* Main Content */}
        <div className="flex-1 p-4 bg-gati-background overflow-y-auto sticky top-[60px] h-[calc(100vh-60px)]">
          <div>
            <OrderMetadata 
              order={orderWithDefaults} 
              onCopy={copyToClipboard} 
            />
            
            <OrderStatusBlock 
              order={orderWithDefaults} 
              onStatusUpdate={handleStatusUpdate}
            />
            
            <OrderTimeline order={orderWithDefaults} />

            <div className="mt-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-3 items-stretch">
                <CustomerDetails
                  order={orderWithDefaults}
                  onCopy={copyToClipboard}
                  onPhoneClick={handlePhoneClick}
                />
                
                <MerchantDetails
                  order={orderWithDefaults}
                  onCopy={copyToClipboard}
                  onShowContacts={() => setShowMerchantContacts(true)}
                  onShowTimings={() => setShowStoreTimingModal(true)}
                  onShowStoreDetails={() => setShowStoreDetailsModal(true)}
                />
                
                <PaymentDetails
                  onShowPaymentDetailsModal={setShowPaymentDetailsModal}
                />
                
                <div className="sm:col-start-1 sm:col-end-3 col-span-full">
                  <RiderDetails
                    order={orderWithDefaults}
                    onCopy={copyToClipboard}
                    onPhoneClick={handlePhoneClick}
                    onToast={showToast}
                    onShowRiderLogModal={setShowRiderLogModal}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <RightSidebar
          order={orderWithDefaults}
          onOpenItemsModal={() => setShowItemsModal(true)}
          onCopy={copyToClipboard}
          onShowRemarks={() => setShowRemarksModal(true)}
          onShowMerchantTimings={() => showToast('Showing merchant timings...')}
          onShowPaymentDetails={() => showToast('Showing payment details...')}
          onShowCxInstructions={() => showToast('Showing customer instructions...')}
          onToast={showToast}
          remarks={remarks as RightSidebarRemark[]}
          onRemarksChange={(newRemarks) => setRemarks(newRemarks as Remark[])}
          currentUser={user || undefined}
          recons={recons}
          onReconsChange={setRecons}
          onShowRecons={() => setShowReconsModal(true)}
          notifications={notifications}
          onNotificationsChange={setNotifications}
          onShowNotifications={() => setShowNotificationsModal(true)}
        />
      </div>

      {/* Modals */}
      <ItemsRefundModal
        isOpen={showItemsModal}
        onClose={() => setShowItemsModal(false)}
        onToast={showToast}
      />
      
      {phoneModalData && (
        <PhoneModal
          isOpen={showPhoneModal}
          onClose={handlePhoneModalClose}
          title={phoneModalData.title}
          phoneNumber={phoneModalData.phone}
          onCopy={copyToClipboard}
        />
      )}
      
      <MerchantContactsModal
        isOpen={showMerchantContacts}
        onClose={() => setShowMerchantContacts(false)}
        onCopy={copyToClipboard}
        onCall={(phone) => showToast(`Calling ${phone}...`)}
      />
      
      <StoreTimingModal
        isOpen={showStoreTimingModal}
        onClose={() => setShowStoreTimingModal(false)}
        storeName={orderWithDefaults.parentMerchantName}
        storeId={orderWithDefaults.merchantId}
      />
      
      <StoreDetailsModal
        isOpen={showStoreDetailsModal}
        onClose={() => setShowStoreDetailsModal(false)}
        details={
          `Order Id: ${orderWithDefaults.orderId}\n` +
          `Order Paid at: ${orderWithDefaults.updatedTime}\n` +
          `MID: ${orderWithDefaults.merchantId}\n` +
          `Store Internal Id: ${orderWithDefaults.merchantUserId}\n` +
          `Merchant Name: ${orderWithDefaults.parentMerchantName}\n` +
          `Locality: ${orderWithDefaults.merchantLocality}\n` +
          `City: Gurgaon\n` +
          `Address: ${orderWithDefaults.customerAddress}\n` +
          `Lat/Lon: ${orderWithDefaults.customerLatLon}\n` +
          `MerchantType: LOCAL\n` +
          `AssignedUser: ${orderWithDefaults.routedTo}\n` +
          `AssignedUserDepartment: Mid Market AM`
        }
      />
      
      <RemarksModal
        isOpen={showRemarksModal}
        onClose={() => setShowRemarksModal(false)}
        remarks={remarks}
        onUpdateRemark={handleUpdateRemark}
      />
      
      <ReconModal
        isOpen={showReconsModal}
        onClose={() => setShowReconsModal(false)}
        recons={recons}
      />
      
      <NotificationModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        notifications={notifications}
      />

      {/* Rider Log Modal - Rendered outside blur container */}
      <RiderLogModal
        isOpen={showRiderLogModal}
        onClose={() => setShowRiderLogModal(false)}
        onCopy={copyToClipboard}
      />

      {/* Payment Details Modal - Rendered outside blur container */}
      <PaymentDetailsModal
        isOpen={showPaymentDetailsModal}
        onClose={() => setShowPaymentDetailsModal(false)}
      />
    </div>
  );
}