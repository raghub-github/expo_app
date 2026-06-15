'use client';

import { useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { Order } from '@/types';
import CxInstructionsModal from './CxInstructionsModal';
import RejectionInfo from './RejectionInfo';

export interface Remark {
  id: string;
  type: string;
  content: string;
  time: string;
  user: string;
  userType: string;
  agentId?: string;
  agentEmail?: string;
  isEdited?: boolean;
  editedTime?: string;
  editHistory?: {
    oldContent: string;
    newContent: string;
    editedBy: string;
    editedAt: string;
  };
}

export interface Recon {
  id: string;
  rider: string;
  rejection: string;
  comment: string;
  time: string;
  agentEmail: string;
}

export interface Notification {
  id: string;
  message: string;
  time: string;
  agentEmail: string;
}

interface RightSidebarProps {
  order: Order;
  onOpenItemsModal: () => void;
  onCopy: (text: string) => void;
  onShowRemarks: () => void;
  onShowMerchantTimings: () => void;
  onShowPaymentDetails: () => void;
  onShowCxInstructions: () => void;
  onToast: (message: string) => void;
  remarks: Remark[];
  onRemarksChange: (remarks: Remark[]) => void;
  currentUser?: { id?: string; email?: string };
  recons: Recon[];
  onReconsChange: (recons: Recon[]) => void;
  onShowRecons: () => void;
  notifications: Notification[];
  onNotificationsChange: (notifications: Notification[]) => void;
  onShowNotifications: () => void;
}

function RightSidebar({
  order,
  onOpenItemsModal,
  onCopy,
  onShowRemarks,
  onShowMerchantTimings,
  onShowPaymentDetails,
  onShowCxInstructions,
  onToast,
  remarks,
  onRemarksChange,
  currentUser,
  recons,
  onReconsChange,
  onShowRecons,
  notifications,
  onNotificationsChange,
  onShowNotifications,
}: RightSidebarProps) {
  const { hasAccess } = usePermissions();
  const [remarkType, setRemarkType] = useState('CUSTOMER');
  const [remarkText, setRemarkText] = useState('');
  const [reconRider, setReconRider] = useState('');
  const [reconRejection, setReconRejection] = useState('');
  const [reconText, setReconText] = useState('');
  const [notificationMessage, setNotificationMessage] = useState('');
  const [showCxInstructionsModal, setShowCxInstructionsModal] = useState(false);

  // Check if user has required permissions for refund
  const hasRefundPermission = hasAccess('canCreateRefund');
  const hasCancellationPermission = hasAccess('canAccessCancellation');
  const canCreateRefund = hasRefundPermission && hasCancellationPermission;

  const handleAddRemark = () => {
    if (!remarkText.trim()) {
      onToast('Please enter a remark');
      return;
    }
    const now = new Date();
    const timeStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear().toString().slice(-2)} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    
    const newRemark: Remark = {
      id: Date.now().toString(),
      type: remarkType,
      content: remarkText,
      time: timeStr,
      user: 'Agent',
      userType: remarkType === 'CUSTOMER' ? 'Customer' : remarkType === 'MERCHANT' ? 'Merchant' : remarkType === 'RIDER' ? 'Rider' : 'Agent',
      agentEmail: currentUser?.email || 'N/A',
      isEdited: false,
    };
    onRemarksChange([newRemark, ...remarks]);
    onToast(`Adding ${remarkType} remark: ${remarkText}`);
    setRemarkText('');
  };

  const handleSendNotification = () => {
    if (!notificationMessage.trim()) {
      onToast('Please enter a notification message');
      return;
    }
    
    const now = new Date();
    const timeStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear().toString().slice(-2)} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    
    const newNotification: Notification = {
      id: Date.now().toString(),
      message: notificationMessage.trim(),
      time: timeStr,
      agentEmail: currentUser?.email || 'N/A',
    };
    
    onNotificationsChange([newNotification, ...notifications]);
    onToast('Customer notification sent successfully');
    setNotificationMessage('');
  };

  const handleAddRecon = () => {
    if (!reconRider || (!reconRejection && !reconText.trim())) {
      onToast('Please select rider and either rejection reason or add a comment');
      return;
    }
    
    const now = new Date();
    const timeStr = `${now.getDate().toString().padStart(2, '0')}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear().toString().slice(-2)} ${now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
    
    const rejectionValue = reconRejection || '';
    const commentValue = reconText.trim() || '';
    
    const newRecon: Recon = {
      id: Date.now().toString(),
      rider: reconRider,
      rejection: rejectionValue,
      comment: commentValue || rejectionValue,
      time: timeStr,
      agentEmail: currentUser?.email || 'N/A',
    };
    
    onReconsChange([newRecon, ...recons]);
    onToast('Recon added successfully');
    setReconText('');
    setReconRider('');
    setReconRejection('');
  };

  return (
    <div className="w-[400px] min-w-[400px] bg-white border-l border-[#f0f0f0] p-6 overflow-y-auto sticky top-[60px] h-[calc(100vh-60px)]">
      <div>
        {/* Order Details */}
        <div className="bg-white rounded-md p-5 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#f0f0f0] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
          <div className="flex justify-between items-center mb-4 pb-3 border-b-2 border-[#f0f0f0]">
            <div className="text-base font-bold text-gati-text-primary flex items-center gap-1.5">
              <i className="bi bi-info-circle"></i>
              Order details
            </div>
          </div>
          <div>
            <ul className="list-none m-0 p-0">
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Items:
                <span className="font-semibold text-gati-text-primary text-right max-w-[60%] break-words">(2)</span>
                <span
                  onClick={onOpenItemsModal}
                  className="text-gati-primary font-medium cursor-pointer transition-colors text-[13px] ml-2"
                >
                  <i className="bi bi-eye"></i> View Items
                </span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Assignment before Acceptance:
                <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gati-error text-white rounded-[20px] leading-none">
                  False
                </span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Distance:
                <span className="font-semibold text-gati-text-primary">2.24 KM</span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Delivery Type:
                <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gati-primary text-white rounded-[20px] leading-none">
                  DELIVERY
                </span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Delivery Initiator:
                <span className="font-semibold text-gati-text-primary">{order.deliveryType}</span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Locality Type:
                <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gati-success text-white rounded-[20px] leading-none">
                  GREEN
                </span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Delivered By:
                <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gati-info text-white rounded-[20px] leading-none">
                  {order.deliveryProvider}
                </span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                System KPT:
                <span className="font-semibold text-gati-text-primary">18 mins</span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Contactless Delivery:
                <span className="inline-block px-2 py-0.5 text-[11px] font-semibold bg-gati-success text-white rounded-[20px] leading-none">
                  True
                </span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                Client Order ID:
                <span className="font-semibold text-gati-text-primary flex items-center gap-1">
                  <i
                    className="bi bi-clipboard text-[11px] text-gati-text-secondary cursor-pointer"
                    onClick={() => onCopy('294562645')}
                  ></i>
                  294562645
                </span>
              </li>
              <li className="py-2 border-b border-[#f0f0f0] flex justify-between items-start text-[13px] text-gati-text-secondary">
                First ETA:
                <span className="font-semibold text-gati-text-primary">19-12-2025 09:25:38 AM</span>
              </li>
              <li className="py-2 flex justify-between items-start text-[13px] text-gati-text-secondary">
                CX Instructions:
                <span
                  onClick={() => setShowCxInstructionsModal(true)}
                  className="text-gati-primary font-medium cursor-pointer transition-colors text-[13px]"
                >
                  <i className="bi bi-chat-left-text"></i> View
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Create Refund - Only show if user has BOTH permissions */}
        {canCreateRefund && (
          <div className="bg-white rounded-md p-5 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#f0f0f0] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
            <button
              onClick={onOpenItemsModal}
              className="w-full py-3 bg-gati-primary hover:bg-gati-primary-dark text-white border-none rounded-sm font-semibold cursor-pointer transition-all text-sm flex items-center justify-center gap-2"
            >
              <i className="bi bi-arrow-counterclockwise"></i>
              Create refund
            </button>
          </div>
        )}

        {/* Add Remarks */}
        <div className="bg-white rounded-md p-5 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#f0f0f0] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
          <div className="flex justify-between items-center mb-4 pb-3 border-b-2 border-[#f0f0f0]">
            <span className="text-base font-bold text-gati-text-primary flex items-center gap-1.5">
              <i className="bi bi-chat-left-dots"></i>
              Add remarks
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onShowRemarks}
                className="bg-transparent border-none text-gati-primary font-medium cursor-pointer text-[13px] transition-colors flex items-center gap-1"
              >
                <i className="bi bi-list-check"></i>
                See all ({remarks.length})
              </button>
              {remarks.some(r => r.editHistory) && (
                <button
                  onClick={onShowRemarks}
                  className="bg-transparent border-none text-gati-info font-medium cursor-pointer text-[13px] transition-colors flex items-center gap-1"
                >
                  <i className="bi bi-clock-history"></i>
                  View Edit History
                </button>
              )}
            </div>
          </div>
          <div>
            <div className="flex flex-col gap-2.5">
              <select
                value={remarkType}
                onChange={(e) => setRemarkType(e.target.value)}
                className="w-full h-[38px] px-2.5 py-2 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white"
              >
                <option value="CUSTOMER">CUSTOMER</option>
                <option value="MERCHANT">MERCHANT</option>
                <option value="RIDER">RIDER</option>
                <option value="MERCHANT_CHAT">MERCHANT_CHAT</option>
              </select>
              {remarkType === 'CUSTOMER' && (
                <select className="w-full h-[38px] px-2.5 py-2 border border-gati-border-color rounded-sm text-[13px]">
                  <option value="">Select Option</option>
                  <option value="Customer confirmed the delivery.">Customer confirmed the delivery.</option>
                  <option value="Cx still not received the order.">Cx still not received the order.</option>
                  <option value="Not able to connect.">Not able to connect.</option>
                </select>
              )}
              <textarea
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                placeholder="Add your comment here..."
                className="w-full p-2.5 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white resize-y min-h-[70px] font-['Roboto',sans-serif]"
              ></textarea>
              <button
                onClick={handleAddRemark}
                className="w-full py-2.5 bg-gati-primary hover:bg-gati-primary-dark text-white border-none rounded-sm font-semibold cursor-pointer transition-all text-[13px] mt-2 flex items-center justify-center gap-1.5"
              >
                <i className="bi bi-send"></i>
                Submit
              </button>
            </div>
          </div>
        </div>

        {/* Send Customer Notification */}
        <div className="bg-white rounded-md p-5 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#f0f0f0] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
          <div className="flex justify-between items-center mb-4 pb-3 border-b-2 border-[#f0f0f0]">
            <span className="text-base font-bold text-gati-text-primary flex items-center gap-1.5">
              <i className="bi bi-bell"></i>
              Send Cx Ntf
            </span>
            <button
              onClick={onShowNotifications}
              className="bg-transparent border-none text-gati-primary font-medium cursor-pointer text-[13px] transition-colors flex items-center gap-1"
            >
              <i className="bi bi-list-check"></i>
              See all ({notifications.length})
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            <textarea
              value={notificationMessage}
              onChange={(e) => setNotificationMessage(e.target.value)}
              placeholder="Enter notification message..."
              className="w-full p-2.5 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white resize-y min-h-[70px] font-['Roboto',sans-serif] focus:outline-none focus:ring-2 focus:ring-gati-primary focus:border-gati-primary"
            ></textarea>
            <button
              onClick={handleSendNotification}
              className="w-full py-2.5 bg-gati-primary hover:bg-gati-primary-dark text-white border-none rounded-sm font-semibold cursor-pointer transition-all text-[13px] flex items-center justify-center gap-1.5 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
            >
              <i className="bi bi-send"></i>
              Send Notification
            </button>
          </div>
        </div>

        {/* Rider Recon */}
        <div className="bg-white rounded-md p-5 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#f0f0f0] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.12)]">
          <div className="flex justify-between items-center mb-4 pb-3 border-b-2 border-[#f0f0f0]">
            <span className="text-base font-bold text-gati-text-primary flex items-center gap-1.5">
              <i className="bi bi-clipboard-check"></i>
              Rider Recon
            </span>
            <button
              onClick={onShowRecons}
              className="bg-transparent border-none text-gati-primary font-medium cursor-pointer text-[13px] transition-colors flex items-center gap-1"
            >
              <i className="bi bi-list-check"></i>
              See all ({recons.length})
            </button>
          </div>
          <div>
            <div className="flex flex-col gap-2.5">
              <select
                value={reconRider}
                onChange={(e) => setReconRider(e.target.value)}
                className="w-full h-[38px] px-2.5 py-2 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-gati-primary focus:border-gati-primary"
              >
                <option value="">Select Rider Option</option>
                <option value="1086718138">SHIPROCKET_DIRECT (Ram Yadav [7761970466])</option>
              </select>
              <select
                value={reconRejection}
                onChange={(e) => setReconRejection(e.target.value)}
                className="w-full h-[38px] px-2.5 py-2 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white focus:outline-none focus:ring-2 focus:ring-gati-primary focus:border-gati-primary"
              >
                <option value="">Select Rejection Option (Optional)</option>
                <option value="Customer denying order">Customer denying order</option>
                <option value="LP Assignment Timeout">LP Assignment Timeout</option>
                <option value="Merchant non-responsive">Merchant non-responsive</option>
              </select>
              <textarea
                value={reconText}
                onChange={(e) => setReconText(e.target.value)}
                placeholder="Add your recon comment here... (Required if rejection option not selected)"
                className="w-full p-2.5 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white resize-y min-h-[70px] font-['Roboto',sans-serif] focus:outline-none focus:ring-2 focus:ring-gati-primary focus:border-gati-primary"
              ></textarea>
              <button
                onClick={handleAddRecon}
                className="w-full py-2.5 bg-gati-primary hover:bg-gati-primary-dark text-white border-none rounded-sm font-semibold cursor-pointer transition-all text-[13px] mt-2 flex items-center justify-center gap-1.5 shadow-[0_2px_4px_rgba(0,0,0,0.1)] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
              >
                <i className="bi bi-check-circle"></i>
                Submit Recon
              </button>
            </div>
          </div>
        </div>
      </div>

        {/* Rejection Info - always show below Rider Recon (uses latest recon if present) */}
        <div className="mb-4">
          <RejectionInfo
            rejectionBy={recons && recons.length > 0 ? (recons[0].agentEmail || 'chatbot') : 'N/A'}
            rejectionReason={recons && recons.length > 0 ? (recons[0].rejection || 'N/A') : 'No rejection recorded'}
            rejectionId={recons && recons.length > 0 ? (recons[0].id || '-') : '-'}
          />
        </div>

        {/* CX Instructions Modal */}
      <CxInstructionsModal
        isOpen={showCxInstructionsModal}
        onClose={() => setShowCxInstructionsModal(false)}
        orderId={order.orderId}
        customerName={order.customerName}
        deliveryAddress={order.customerAddress}
        customerInstructions={
          'customerInstructions' in order ? order.customerInstructions : ''
        }
      />
    </div>
  );
}

export default RightSidebar;