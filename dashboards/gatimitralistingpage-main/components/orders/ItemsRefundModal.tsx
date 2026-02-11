'use client';

import { useState, useEffect, useRef } from 'react';
import { usePermissions } from '@/hooks/usePermissions';

interface ItemsRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (message: string) => void;
}

interface RefundItem {
  id: number;
  name: string;
  customisation: string;
  quantity: number;
  amountPerQuantity: number;
  refundType: 'NONE' | 'FULL' | 'PARTIAL';
  selectedQuantity: number;
  remark: string;
  showDropdown: boolean;
  customAmount: number;
  isSelected: boolean;
  hasImage: boolean;
  imageUrl?: string;
  refundPercentage: number; // New field for percentage-based refund
}

export default function ItemsRefundModal({ isOpen, onClose, onToast }: ItemsRefundModalProps) {
  const { hasAccess } = usePermissions();
  const [refundAttribute, setRefundAttribute] = useState('');
  const [refundRejection, setRefundRejection] = useState('');
  const [refundType, setRefundType] = useState('');
  const [fault, setFault] = useState('');
  const [merchantDebit, setMerchantDebit] = useState('');
  const [rejectionOptions, setRejectionOptions] = useState<string[]>([]);
  const [showRefundType, setShowRefundType] = useState(false);
  const [showFault, setShowFault] = useState(false);
  const [showMerchantDebit, setShowMerchantDebit] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [isRefundCompleted, setIsRefundCompleted] = useState(false);
  const [refundActionMessage, setRefundActionMessage] = useState('');
  const [selectAll, setSelectAll] = useState(false);
  
  // Image modal state
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedItemImage, setSelectedItemImage] = useState<{ id: number; name: string; imageUrl: string } | null>(null);
  
  // Refs for auto-scroll
  const refundTypeRef = useRef<HTMLDivElement>(null);
  const faultRef = useRef<HTMLDivElement>(null);
  const merchantDebitRef = useRef<HTMLDivElement>(null);
  const refundItemsRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const imageModalRef = useRef<HTMLDivElement>(null);
  
  // Refund items data including delivery fee
  const [refundItems, setRefundItems] = useState<RefundItem[]>([
    {
      id: 71150283,
      name: 'Schezwan Chicken Rice Bowl',
      customisation: '-',
      quantity: 3,
      amountPerQuantity: 299,
      refundType: 'NONE',
      selectedQuantity: 0,
      remark: '',
      showDropdown: false,
      customAmount: 299,
      isSelected: false,
      hasImage: true,
      imageUrl: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop',
      refundPercentage: 0
    },
    {
      id: 71150296,
      name: 'Singapore Chilli Chicken',
      customisation: '-',
      quantity: 1,
      amountPerQuantity: 249,
      refundType: 'NONE',
      selectedQuantity: 0,
      remark: '',
      showDropdown: false,
      customAmount: 249,
      isSelected: false,
      hasImage: true,
      imageUrl: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=400&fit=crop',
      refundPercentage: 0
    },
    {
      id: 89228408,
      name: 'Crispy Corn',
      customisation: '-',
      quantity: 1,
      amountPerQuantity: 158,
      refundType: 'NONE',
      selectedQuantity: 0,
      remark: '',
      showDropdown: false,
      customAmount: 158,
      isSelected: false,
      hasImage: false,
      refundPercentage: 0
    },
    {
      id: 99999999, // Delivery fee ID
      name: 'Delivery Fee',
      customisation: '-',
      quantity: 1,
      amountPerQuantity: 0,
      refundType: 'NONE',
      selectedQuantity: 0,
      remark: '',
      showDropdown: false,
      customAmount: 0,
      isSelected: false,
      hasImage: false,
      refundPercentage: 0
    }
  ]);

  // Check if user has required permissions
  const hasRefundPermission = hasAccess('canCreateRefund');
  const hasCancellationPermission = hasAccess('canAccessCancellation');
  const canCreateRefund = hasRefundPermission && hasCancellationPermission;

  // Check if modal should be open based on prop or localStorage
  const shouldModalBeOpen = () => {
    // First priority: isOpen prop from parent
    if (isOpen) return true;
    
    // Second priority: check localStorage for persisted state
    const savedModalState = localStorage.getItem('refundModalOpen');
    return savedModalState === 'true';
  };

  const [modalOpen, setModalOpen] = useState(shouldModalBeOpen());

  // Update modal open state when isOpen prop changes
  useEffect(() => {
    if (isOpen) {
      setModalOpen(true);
    }
  }, [isOpen]);

  // Save modal state to localStorage when it changes
  useEffect(() => {
    if (modalOpen) {
      localStorage.setItem('refundModalOpen', 'true');
    } else {
      localStorage.removeItem('refundModalOpen');
    }
  }, [modalOpen]);

  // Save current form state to localStorage
  useEffect(() => {
    if (modalOpen) {
      const formState = {
        refundAttribute,
        refundRejection,
        refundType,
        fault,
        merchantDebit,
        showRefundType,
        showFault,
        showMerchantDebit,
        showSubmit,
        refundItems,
        rejectionOptions,
        selectAll
      };
      localStorage.setItem('refundFormState', JSON.stringify(formState));
    }
  }, [
    modalOpen, refundAttribute, refundRejection, refundType, fault, merchantDebit,
    showRefundType, showFault, showMerchantDebit, showSubmit, refundItems, rejectionOptions, selectAll
  ]);

  // Load form state from localStorage when modal opens
  useEffect(() => {
    if (modalOpen) {
      const savedFormState = localStorage.getItem('refundFormState');
      if (savedFormState) {
        try {
          const parsedState = JSON.parse(savedFormState);
          setRefundAttribute(parsedState.refundAttribute || '');
          setRefundRejection(parsedState.refundRejection || '');
          setRefundType(parsedState.refundType || '');
          setFault(parsedState.fault || '');
          setMerchantDebit(parsedState.merchantDebit || '');
          setShowRefundType(parsedState.showRefundType || false);
          setShowFault(parsedState.showFault || false);
          setShowMerchantDebit(parsedState.showMerchantDebit || false);
          setShowSubmit(parsedState.showSubmit || false);
          if (parsedState.refundItems) {
            setRefundItems(parsedState.refundItems);
          }
          if (parsedState.rejectionOptions) {
            setRejectionOptions(parsedState.rejectionOptions);
          }
          if (parsedState.selectAll !== undefined) {
            setSelectAll(parsedState.selectAll);
          }
        } catch (error) {
          console.error('Error loading form state:', error);
          // Clear localStorage if there's an error
          localStorage.removeItem('refundFormState');
        }
      }
    }
  }, [modalOpen]);

  // Update selectAll state when individual item selections change
  useEffect(() => {
    const allItemsSelected = refundItems.every(item => item.isSelected);
    setSelectAll(allItemsSelected);
  }, [refundItems]);

  // Auto-scroll to active section
  useEffect(() => {
    if (!modalOpen) return;

    const scrollToSection = () => {
      let targetRef = null;
      
      if (showSubmit && submitButtonRef.current) {
        setTimeout(() => {
          submitButtonRef.current?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
        }, 100);
      } else if (showMerchantDebit && merchantDebitRef.current) {
        targetRef = merchantDebitRef.current;
      } else if (showFault && faultRef.current) {
        targetRef = faultRef.current;
      } else if (showRefundType && refundTypeRef.current) {
        targetRef = refundTypeRef.current;
      } else if (refundType === 'refund_without_cancellation' && refundItemsRef.current) {
        targetRef = refundItemsRef.current;
      }
      
      if (targetRef) {
        setTimeout(() => {
          targetRef?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        }, 100);
      }
    };

    scrollToSection();
  }, [showRefundType, showFault, showMerchantDebit, showSubmit, refundType, modalOpen]);

  // Auto-show Merchant Debit options when fault is pre-selected (e.g., by default)
  // This ensures that if a fault is already set when showFault becomes true, 
  // the Merchant Debit options appear after 1 second delay
  useEffect(() => {
    if (!modalOpen) return;
    
    // If fault is already selected and showFault is true, but showMerchantDebit is false
    if (fault && showFault && !showMerchantDebit) {
      const timer = setTimeout(() => {
        setShowMerchantDebit(true);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [fault, showFault, showMerchantDebit, modalOpen]);

  // Check if at least one item is selected for option 1 and 2
  const checkItemSelectionForCancellation = () => {
    const hasSelectedItem = refundItems.some(item => item.isSelected && item.id !== 99999999);
    const hasSelectedDeliveryFee = refundItems.some(item => item.isSelected && item.id === 99999999);
    return hasSelectedItem || hasSelectedDeliveryFee;
  };

  // Map refund attribute to default fault
  const getDefaultFaultForAttribute = (attribute: string): string => {
    const faultMapping: { [key: string]: string } = {
      'CUSTOMER': 'customer_fault',
      'MERCHANT': 'merchant_fault',
      'RIDER': '3pl_fault',
      'SYSTEM': 'exceptional',
      'OTHER': '', // No default fault for OTHER
    };
    return faultMapping[attribute] || '';
  };

  const handleAttributeChange = (value: string) => {
    if (refundAttribute === value) {
      setRefundAttribute('');
      setRefundRejection('');
      setRejectionOptions([]);
      setShowRefundType(false);
      setFault('');
      return;
    }
    
    setRefundAttribute(value);
    setRefundRejection('');
    setShowRefundType(false);
    
    // Auto-set fault based on attribute (except for OTHER)
    const defaultFault = getDefaultFaultForAttribute(value);
    setFault(defaultFault);
    
    const options: { [key: string]: string[] } = {
      'CUSTOMER': ['Customer denying order', 'Customer non-responsive', 'Wrong customer address'],
      'MERCHANT': ['Merchant closed', 'Items out of stock', 'Merchant not responding', 'Merchant cancelled order'],
      'RIDER': ['Rider not responding', 'Rider denied order', 'Rider late', 'Rider cancelled'],
      'SYSTEM': ['Technical issue', 'Payment failure', 'System error'],
      'OTHER': ['Weather conditions', 'Force majeure', 'Other'],
    };
    
    setRejectionOptions(options[value] || []);
  };

  const handleRejectionChange = (value: string) => {
    if (refundRejection === value) {
      setRefundRejection('');
      setShowRefundType(false);
      return;
    }
    
    setRefundRejection(value);
    setShowRefundType(true);
  };

  const handleRefundTypeChange = (value: string) => {
    if (refundType === value) {
      setRefundType('');
      setShowFault(false);
      return;
    }
    
    setRefundType(value);
    setShowFault(true);
    
    // Initialize selectedQuantity to 1 for "refund_without_cancellation"
    if (value === 'refund_without_cancellation') {
      setRefundItems(prev => prev.map(item => ({
        ...item,
        selectedQuantity: item.id !== 99999999 ? 1 : 0
      })));
    }
  };

  const handleFaultChange = (value: string) => {
    if (fault === value) {
      setFault('');
      setShowMerchantDebit(false);
      return;
    }
    
    setFault(value);
    // Show merchant debit options after 1 second delay
    setTimeout(() => {
      setShowMerchantDebit(true);
    }, 1000);
  };

  const handleMerchantDebitChange = (value: string) => {
    if (merchantDebit === value) {
      setMerchantDebit('');
      setShowSubmit(false);
      return;
    }
    
    setMerchantDebit(value);
    setShowSubmit(true);
  };

  const toggleItemSelection = (itemId: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const updatedItem = { 
          ...item, 
          isSelected: !item.isSelected 
        };
        return updatedItem;
      }
      return item;
    }));
  };

  const handleSelectAll = () => {
    const newSelectAllState = !selectAll;
    setSelectAll(newSelectAllState);
    
    setRefundItems(prev => prev.map(item => ({
      ...item,
      isSelected: newSelectAllState
    })));
  };

  const toggleRefundItemDropdown = (itemId: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, showDropdown: !item.showDropdown };
      }
      // Close other dropdowns
      if (item.showDropdown) {
        return { ...item, showDropdown: false };
      }
      return item;
    }));
  };

  const handleRefundItemTypeChange = (itemId: number, type: 'NONE' | 'FULL' | 'PARTIAL') => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const updatedItem = { 
          ...item, 
          refundType: type,
          showDropdown: false // Close dropdown after selection
        };
        
        // If NONE is selected, reset selected quantity
        if (type === 'NONE') {
          updatedItem.selectedQuantity = 0;
          updatedItem.customAmount = item.amountPerQuantity;
        }
        // If FULL is selected, set selected quantity to max quantity
        else if (type === 'FULL') {
          updatedItem.selectedQuantity = item.quantity;
          updatedItem.customAmount = item.amountPerQuantity;
        }
        // If PARTIAL is selected and quantity is 0, set to 1
        else if (type === 'PARTIAL' && item.selectedQuantity === 0) {
          updatedItem.selectedQuantity = 1;
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const handleQuantityChange = (itemId: number, quantity: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        // Ensure quantity doesn't exceed available quantity
        const newQuantity = Math.min(Math.max(0, quantity), item.quantity);
        const updatedItem = { 
          ...item, 
          selectedQuantity: newQuantity
        };
        
        // If quantity is 0, set type to NONE
        if (newQuantity === 0) {
          updatedItem.refundType = 'NONE';
          updatedItem.customAmount = item.amountPerQuantity;
        }
        // If quantity equals max quantity, set type to FULL
        else if (newQuantity === item.quantity) {
          updatedItem.refundType = 'FULL';
          updatedItem.customAmount = item.amountPerQuantity;
        }
        // If quantity is between 0 and max, set type to PARTIAL
        else if (newQuantity > 0 && newQuantity < item.quantity) {
          updatedItem.refundType = 'PARTIAL';
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const handleCustomAmountChange = (itemId: number, amount: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { 
          ...item, 
          customAmount: Math.max(0, amount)
        };
      }
      return item;
    }));
  };

  const handleRemarkChange = (itemId: number, remark: string) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return { ...item, remark };
      }
      return item;
    }));
  };

  // Handle per-item percentage change for refund without cancellation
  // FIXED: Removed automatic quantity setting to maximum value
  const handlePercentageChange = (itemId: number, percentage: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        // Get current selected quantity (default is 1 when refund type is selected)
        const currentQuantity = item.selectedQuantity > 0 ? item.selectedQuantity : 1;
        const calculatedAmount = (item.amountPerQuantity * percentage * currentQuantity) / 100;
        
        return { 
          ...item, 
          refundPercentage: percentage,
          customAmount: calculatedAmount,
          refundType: percentage > 0 ? 'PARTIAL' : 'NONE',
          // DO NOT automatically change quantity - keep it as is
          selectedQuantity: percentage > 0 ? Math.max(1, item.selectedQuantity) : 0
        };
      }
      return item;
    }));
  };

  // Generate percentage options (10% to 100% in steps of 10)
  const generatePercentageOptions = () => {
    const options = [0];
    for (let i = 10; i <= 100; i += 10) {
      options.push(i);
    }
    return options;
  };

  // Calculate refund amount based on item's percentage and selected quantity
  const calculatePercentageRefundAmount = (item: RefundItem) => {
    if (item.refundPercentage === 0) return 0;
    const qty = item.selectedQuantity > 0 ? item.selectedQuantity : 1; // Default to 1 if not set
    return (item.amountPerQuantity * item.refundPercentage * qty) / 100;
  };

  // Calculate total refund amount based on each item's percentage
  const calculateTotalPercentageRefundAmount = () => {
    return refundItems
      .filter(item => item.id !== 99999999)
      .reduce((total, item) => {
        if (item.refundPercentage === 0) return total;
        const qty = item.selectedQuantity > 0 ? item.selectedQuantity : 1; // Default to 1 if not set
        return total + (item.amountPerQuantity * item.refundPercentage * qty) / 100;
      }, 0);
  };

  // Handle image click to show modal
  const handleImageClick = (item: RefundItem) => {
    if (item.hasImage && item.imageUrl) {
      setSelectedItemImage({
        id: item.id,
        name: item.name,
        imageUrl: item.imageUrl
      });
      setShowImageModal(true);
    }
  };

  // Close image modal
  const closeImageModal = () => {
    setShowImageModal(false);
    setSelectedItemImage(null);
  };

  const generateQuantityOptions = (maxQuantity: number) => {
    const options = [];
    for (let i = 0; i <= maxQuantity; i++) {
      options.push(i);
    }
    return options;
  };

  // Generate quantity options starting from 1 (for refund without cancellation)
  const generateQuantityOptionsFrom1 = (maxQuantity: number) => {
    const options = [];
    for (let i = 1; i <= maxQuantity; i++) {
      options.push(i);
    }
    return options;
  };

  // Handle quantity change for refund without cancellation (selectedQuantity for percentage calculation)
  const handleRefundQuantityChange = (itemId: number, quantity: number) => {
    setRefundItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const updatedItem = { 
          ...item, 
          selectedQuantity: quantity
        };
        
        // Recalculate custom amount based on new quantity and percentage
        if (item.refundPercentage > 0) {
          updatedItem.customAmount = (item.amountPerQuantity * item.refundPercentage * quantity) / 100;
        }
        
        return updatedItem;
      }
      return item;
    }));
  };

  const calculateTotalRefundAmount = () => {
    return refundItems.reduce((total, item) => {
      if (item.refundType !== 'NONE') {
        // For refund_without_cancellation, use percentage-based calculation
        if (refundType === 'refund_without_cancellation' && item.refundPercentage > 0) {
          return total + calculatePercentageRefundAmount(item);
        }
        // Use custom amount if refund type is PARTIAL, otherwise use original amount
        const amount = item.refundType === 'PARTIAL' ? item.customAmount : item.amountPerQuantity;
        return total + (item.selectedQuantity * amount);
      }
      return total;
    }, 0);
  };

  const handleSubmit = () => {
    if (!refundAttribute || !refundRejection || !refundType || !fault || !merchantDebit) {
      if (onToast) {
        onToast('Please complete all refund options');
      }
      return;
    }

    // Different validation based on refund type
    if (refundType === 'refund_without_cancellation') {
      // For option 3: Check if any refund items are selected in the refund form
      const hasRefundItems = refundItems.some(item => item.refundType !== 'NONE');
      if (!hasRefundItems) {
        if (onToast) {
          onToast('Please select at least one item for refund in the refund form');
        }
        return;
      }
    } else {
      // For options 1 and 2: Check if at least one item (including delivery fee) is selected
      if (!checkItemSelectionForCancellation()) {
        if (onToast) {
          onToast('Please select at least one item (including delivery fee if applicable)');
        }
        return;
      }
    }
    
    // Set refund action message based on refund type
    let actionMessage = '';
    switch(refundType) {
      case 'cancel_without_refund':
        actionMessage = 'Order cancelled without refund';
        break;
      case 'refund_with_cancellation':
        actionMessage = 'Order cancelled with refund';
        break;
      case 'refund_without_cancellation':
        actionMessage = 'Partial refund processed';
        break;
    }
    setRefundActionMessage(actionMessage);
    
    // Show warning popup
    setShowWarning(true);
  };

  const confirmRefund = () => {
    const selectedItemIds = refundItems.filter(item => item.isSelected).map(item => item.id);
    const refundData = {
      selectedItems: selectedItemIds,
      attribute: refundAttribute,
      rejection: refundRejection,
      refundType,
      fault,
      merchantDebit,
      refundItems: refundType === 'refund_without_cancellation' ? 
        refundItems.filter(item => item.refundType !== 'NONE') : [],
      totalRefundAmount: refundType === 'refund_without_cancellation' ? calculateTotalRefundAmount() : 0
    };
    
    // Show completion notification
    setIsRefundCompleted(true);
    
    // Set notification message based on action
    let notificationMessage = '';
    switch(refundType) {
      case 'cancel_without_refund':
        notificationMessage = 'Order has been cancelled successfully without refund.';
        break;
      case 'refund_with_cancellation':
        notificationMessage = 'Order has been cancelled and refund processed successfully.';
        break;
      case 'refund_without_cancellation':
        notificationMessage = `Refund of ₹${calculateTotalRefundAmount().toFixed(2)} has been processed successfully.`;
        break;
    }
    
    if (onToast) {
      onToast(notificationMessage);
    }
    
    // Reset form after delay
    setTimeout(() => {
      setIsRefundCompleted(false);
      setRefundAttribute('');
      setRefundRejection('');
      setRefundType('');
      setFault('');
      setMerchantDebit('');
      setRejectionOptions([]);
      setShowRefundType(false);
      setShowFault(false);
      setShowMerchantDebit(false);
      setShowSubmit(false);
      setShowWarning(false);
      setSelectAll(false);
      setRefundItems(prev => prev.map(item => ({
        ...item,
        refundType: 'NONE',
        selectedQuantity: 0,
        remark: '',
        showDropdown: false,
        customAmount: item.amountPerQuantity,
        isSelected: false,
        refundPercentage: 0
      })));
      
      // Clear localStorage
      localStorage.removeItem('refundModalOpen');
      localStorage.removeItem('refundFormState');
      
      // Close modal
      setModalOpen(false);
      if (onClose) onClose();
    }, 3000);
  };

  const cancelRefund = () => {
    setShowWarning(false);
    if (onToast) {
      onToast('Refund creation cancelled');
    }
  };

  const getRefundTypeLabel = (type: 'NONE' | 'FULL' | 'PARTIAL') => {
    switch(type) {
      case 'NONE': return 'NONE';
      case 'FULL': return 'FULL';
      case 'PARTIAL': return 'PARTIAL';
      default: return 'NONE';
    }
  };

  const handleModalClose = () => {
    setModalOpen(false);
    localStorage.removeItem('refundModalOpen');
    if (onClose) onClose();
  };

  // Don't render if modal is not open
  if (!modalOpen) return null;

  return (
    <>
      {/* Completion Notification */}
      {isRefundCompleted && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10001] p-5">
          <div className="bg-white rounded-lg w-full max-w-[400px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] animate-[fadeIn_0.3s_ease]">
            <div className="p-6">
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                  <i className="bi bi-check-circle text-green-500 text-2xl"></i>
                </div>
                <h3 className="text-lg font-semibold text-gati-text-primary mb-2">
                  {refundActionMessage}
                </h3>
                <p className="text-gati-text-secondary text-sm mb-6">
                  The action has been completed successfully.
                </p>
                <div className="w-12 h-1 bg-gati-primary rounded-full"></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Warning Popup */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-5">
          <div className="bg-white rounded-lg w-full max-w-[500px] shadow-[0_20px_40px_rgba(0,0,0,0.3)] animate-[fadeIn_0.3s_ease]">
            <div className="p-6 border-b border-gati-border-color">
              <h3 className="text-lg font-semibold text-gati-text-primary flex items-center gap-2">
                <i className="bi bi-exclamation-triangle text-yellow-500"></i> Confirm Refund
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gati-text-primary mb-6">
                You are about to create a refund. Once submitted, this action cannot be undone. 
                You will be responsible for this refund.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={cancelRefund}
                  className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 border-none rounded-sm font-medium cursor-pointer transition-all text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRefund}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white border-none rounded-sm font-medium cursor-pointer transition-all text-sm"
                >
                  Confirm Refund
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Modal Popup */}
      {showImageModal && selectedItemImage && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10002] p-5"
          onClick={closeImageModal}
        >
          <div 
            ref={imageModalRef}
            className="bg-white rounded-xl w-full max-w-[500px] shadow-[0_20px_60px_rgba(0,0,0,0.4)] animate-[fadeIn_0.2s_ease] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-50 to-white px-5 py-4 border-b border-gray-200 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <i className="bi bi-image text-blue-600 text-lg"></i>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-800">Item Image</h3>
                  <p className="text-xs text-gray-500 mt-0.5">ID: {selectedItemImage.id}</p>
                </div>
              </div>
              <button
                onClick={closeImageModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
              >
                <i className="bi bi-x-lg text-lg"></i>
              </button>
            </div>
            
            {/* Modal Body - Image */}
            <div className="p-5">
              <div className="text-center mb-4">
                <h4 className="text-lg font-semibold text-gray-800">{selectedItemImage.name}</h4>
              </div>
              <div className="rounded-xl overflow-hidden border border-gray-200 shadow-lg">
                <img 
                  src={selectedItemImage.imageUrl} 
                  alt={selectedItemImage.name}
                  className="w-full h-auto object-cover max-h-[400px]"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=Image+Not+Available';
                  }}
                />
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-200">
              <button
                onClick={closeImageModal}
                className="w-full py-2.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
        onClick={(e) => {
          if (e.target === e.currentTarget) handleModalClose();
        }}
      >
        <div
          className="bg-white rounded-lg w-full max-w-[1100px] max-h-[90vh] overflow-y-auto shadow-[0_20px_40px_rgba(0,0,0,0.2)] animate-[fadeIn_0.3s_ease]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gati-primary-super-light px-6 py-4 border-b border-gati-border-color flex justify-between items-center rounded-t-lg sticky top-0 z-10">
            <h3 className="text-lg font-semibold text-gati-text-primary flex items-center gap-2 m-0">
              <span className="flex items-center min-w-[32px] min-h-[32px] justify-center">
                <i className="bi bi-box-seam text-2xl sm:text-2xl md:text-3xl lg:text-3xl xl:text-4xl text-gati-primary"></i>
              </span>
              <span className="truncate">Items details</span>
            </h3>
            <span
              className="text-2xl cursor-pointer text-gati-text-light transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:text-gati-text-primary"
              onClick={handleModalClose}
            >
              ×
            </span>
          </div>

          {/* Body */}
          <div className="p-6">
            {/* Select All Section with CSS */}
            <div className="mb-6 p-4 bg-gradient-to-r from-gati-primary-super-light to-white border border-gati-border-light rounded-lg shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="w-5 h-5 text-gati-primary border-2 border-gati-border-color rounded-lg focus:ring-2 focus:ring-gati-primary focus:ring-offset-2 focus:ring-offset-white cursor-pointer transition-all duration-200 peer"
                      />
                      <div className="absolute inset-0 bg-gati-primary/10 rounded-lg opacity-0 peer-checked:opacity-100 transition-opacity duration-200"></div>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity duration-200">
                        <i className="bi bi-check-lg text-white text-xs"></i>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-base font-semibold text-gati-text-primary group-hover:text-gati-primary transition-colors duration-200">
                        Select All Items
                      </span>
                      <span className="text-sm text-gati-text-light mt-0.5">
                        Click to select/deselect all items at once
                      </span>
                    </div>
                  </label>
                </div>
                
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-gati-border-light shadow-xs">
                  <div className={`w-3 h-3 rounded-full ${selectAll ? 'bg-green-500' : 'bg-blue-500'} animate-pulse`}></div>
                  <span className="text-sm font-medium text-gati-text-primary">
                    <span className="font-bold text-gati-primary">{refundItems.filter(item => item.isSelected).length}</span>
                    <span className="text-gati-text-light mx-1">of</span>
                    <span className="font-bold text-gati-text-primary">{refundItems.length}</span>
                    <span className="text-gati-text-light ml-1">selected</span>
                  </span>
                </div>
              </div>
              
              {/* Progress indicator */}
              <div className="mt-3">
                <div className="h-1.5 bg-gati-border-light rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-gati-primary to-gati-primary-dark rounded-full transition-all duration-500 ease-out"
                    style={{ 
                      width: `${(refundItems.filter(item => item.isSelected).length / refundItems.length) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            </div>

            {/* Items Table with Selection */}
            <table className="w-full border-collapse text-sm mb-6">
              <thead>
                <tr>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Select</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Id</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Status</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Name</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Customisation</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Quantity</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Amount</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Tax</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Charges</th>
                  <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Total Price</th>
                </tr>
              </thead>
              <tbody>
                {refundItems.map((item) => (
                  <tr key={item.id} className={item.isSelected ? 'bg-gradient-to-r from-gati-primary-super-light/50 to-transparent' : ''}>
                    <td className="p-3 border border-gati-border-color text-center">
                      <input
                        type="checkbox"
                        checked={item.isSelected}
                        onChange={() => toggleItemSelection(item.id)}
                        className="w-4 h-4 text-gati-primary border-gati-border-color rounded focus:ring-gati-primary cursor-pointer transition-all duration-200 hover:scale-110"
                      />
                    </td>
                    <td className="p-3 border border-gati-border-color text-center">
                      <div className="font-semibold font-mono">
                        {/* Items with Images - Blue Color, Clickable */}
                        {item.hasImage && item.id !== 99999999 && (
                          <span 
                            onClick={() => handleImageClick(item)}
                            className="text-gati-primary-dark bg-blue-50 px-2 py-1 rounded border border-blue-100 inline-flex items-center gap-1.5 cursor-pointer hover:bg-blue-100 hover:border-blue-300 transition-all group"
                            title="Click to view image"
                          >
                            <i className="bi bi-image text-blue-500 group-hover:text-blue-600"></i>
                            {item.id}
                          </span>
                        )}
                        
                        {/* Items without Images - Green Color */}
                        {!item.hasImage && item.id !== 99999999 && (
                          <span className="text-green-600 bg-green-50 px-2 py-1 rounded border border-green-100 inline-block">
                            {item.id}
                          </span>
                        )}
                        
                        {/* Delivery Fee - Gray Color */}
                        {item.id === 99999999 && (
                          <span className="text-gati-text-light bg-gray-50 px-2 py-1 rounded border border-gray-100 inline-block">
                            DEL-FEE
                            <span className="ml-2 text-gray-400 text-xs">
                              <i className="bi bi-truck"></i> Delivery
                            </span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                      {item.id === 99999999 ? 'FIXED' : 'AVAILABLE'}
                    </td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">{item.name}</td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">{item.customisation}</td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                      {item.id === 99999999 ? '-' : item.quantity}
                    </td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                      {item.id === 99999999 ? '0' : item.amountPerQuantity}
                    </td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                      {item.id === 99999999 ? '0' : (item.amountPerQuantity * 0.05).toFixed(2)}
                    </td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                      {item.id === 99999999 ? '0' : (item.amountPerQuantity * 0.05).toFixed(2)}
                    </td>
                    <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                      {item.id === 99999999 ? '0' : (item.amountPerQuantity * 1.1).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary */}
            <div className="mt-4 max-w-[420px] ml-auto bg-gradient-to-br from-gati-background to-white p-5 rounded-lg border border-gati-border-light shadow-sm">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center py-1.5 text-[13px] border-b border-gati-border-light/50 pb-2">
                  <span className="text-gati-text-primary">Items Amount Total</span>
                  <span className="font-medium text-gati-text-primary">706</span>
                </div>
                <div className="flex justify-between items-center py-1.5 text-[13px] border-b border-gati-border-light/50 pb-2">
                  <span className="text-gati-text-primary">Restaurant Packaging Charges</span>
                  <span className="font-medium text-gati-text-primary">25</span>
                </div>
                <div className="flex justify-between items-center py-1.5 text-[13px] border-b border-gati-border-light/50 pb-2">
                  <span className="text-gati-text-primary">Packaging Charges Tax</span>
                  <span className="font-medium text-gati-text-primary">1.25</span>
                </div>
                <div className="flex justify-between items-center py-1.5 text-[13px] border-b border-gati-border-light/50 pb-2">
                  <span className="text-gati-text-primary">GST on item total</span>
                  <span className="font-medium text-gati-text-primary">35.3</span>
                </div>
                <div className="flex justify-between items-center py-1.5 text-[13px] border-b border-gati-border-light/50 pb-2">
                  <span className="text-gati-text-primary">Delivery Fee</span>
                  <span className="font-medium text-gati-text-primary">0</span>
                </div>
                <div className="font-bold border-t border-gati-border-color mt-3 pt-3 text-gati-text-primary text-base flex justify-between items-center">
                  <span>Total Order Amount</span>
                  <span className="text-lg text-gati-primary">₹767.55</span>
                </div>
              </div>
            </div>

            {/* Create Refund Section - Only show if user has permission */}
            {canCreateRefund && (
              <>
                <h4 className="mt-8 mb-3 text-base font-semibold text-gati-text-primary flex items-center gap-2">
                  <i className="bi bi-arrow-counterclockwise"></i> Create refund
                </h4>

                {/* Select refund reason */}
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <label className="text-sm font-medium text-gati-text-primary whitespace-nowrap">Select refund reason</label>
                  <select
                    value={refundAttribute}
                    onChange={(e) => handleAttributeChange(e.target.value)}
                    className="h-[38px] px-3 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white min-w-[200px] focus:outline-none focus:ring-2 focus:ring-gati-primary focus:border-gati-primary"
                  >
                    <option value="">Select Attribute</option>
                    <option value="CUSTOMER">CUSTOMER</option>
                    <option value="MERCHANT">MERCHANT</option>
                    <option value="RIDER">RIDER</option>
                    <option value="SYSTEM">SYSTEM</option>
                    <option value="OTHER">OTHER</option>
                  </select>
                  <select
                    value={refundRejection}
                    onChange={(e) => handleRejectionChange(e.target.value)}
                    disabled={!refundAttribute}
                    className={`h-[38px] px-3 border rounded-sm text-[13px] bg-white min-w-[200px] focus:outline-none focus:ring-2 focus:border-gati-primary ${refundAttribute ? 'border-gati-primary text-gati-text-primary cursor-pointer' : 'border-gati-border-color text-gati-text-light cursor-not-allowed bg-gati-background'}`}
                  >
                    <option value="">Select Rejection Option</option>
                    {rejectionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Refund type - Only shown when rejection is selected */}
                {showRefundType && (
                  <div ref={refundTypeRef} className="mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-4 bg-gati-primary rounded"></div>
                      <label className="block text-sm font-medium text-gati-text-primary">Refund type</label>
                    </div>
                    <div className="flex gap-4 flex-wrap">
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${refundType === 'cancel_without_refund' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="refundType"
                          value="cancel_without_refund"
                          checked={refundType === 'cancel_without_refund'}
                          onChange={(e) => handleRefundTypeChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Cancel order without Customer Refund
                      </label>
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${refundType === 'refund_with_cancellation' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="refundType"
                          value="refund_with_cancellation"
                          checked={refundType === 'refund_with_cancellation'}
                          onChange={(e) => handleRefundTypeChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Customer Refund with Cancellation
                      </label>
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${refundType === 'refund_without_cancellation' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="refundType"
                          value="refund_without_cancellation"
                          checked={refundType === 'refund_without_cancellation'}
                          onChange={(e) => handleRefundTypeChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Customer Refund without cancellation
                      </label>
                    </div>
                    
                    {/* Show refund items table when 3rd option is selected */}
                    {refundType === 'refund_without_cancellation' && (
                      <div ref={refundItemsRef} className="mt-6 p-4 border border-gati-border-color rounded-sm bg-white">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="w-2 h-4 bg-blue-500 rounded"></div>
                          <h5 className="text-sm font-medium text-gati-text-primary">Select Refund Debit reason</h5>
                        </div>
                        
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr>
                              <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Name</th>
                              <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Customisation</th>
                              <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Remark</th>
                              <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Quantity</th>
                              <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Amount Per Quantity</th>
                              <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Refund %</th>
                              <th className="p-3 border border-gati-border-color text-center bg-gati-primary-super-light font-semibold text-gati-text-primary text-[13px]">Refund Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {refundItems.filter(item => item.id !== 99999999).map((item) => (
                              <tr key={item.id} className={item.refundPercentage > 0 ? 'bg-green-50/50' : ''}>
                                <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                                  ({item.id}) {item.name}
                                </td>
                                <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                                  {item.customisation}
                                </td>
                                <td className="p-3 border border-gati-border-color text-center">
                                  <input
                                    type="text"
                                    value={item.remark}
                                    onChange={(e) => handleRemarkChange(item.id, e.target.value)}
                                    placeholder="Remark"
                                    className="w-full h-[30px] px-2 border border-gati-border-color rounded-sm text-xs text-gati-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-gati-primary focus:border-gati-primary"
                                  />
                                </td>
                                <td className="p-3 border border-gati-border-color text-center">
                                  <div className="relative">
                                    <select
                                      value={item.selectedQuantity || 1}
                                      onChange={(e) => handleRefundQuantityChange(item.id, parseInt(e.target.value))}
                                      className="w-full h-[30px] px-2 border border-gati-border-color rounded-sm text-xs text-gati-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-gati-primary focus:border-gati-primary appearance-none cursor-pointer"
                                    >
                                      {generateQuantityOptionsFrom1(item.quantity).map((qty) => (
                                        <option key={qty} value={qty}>
                                          {qty}
                                        </option>
                                      ))}
                                    </select>
                                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                      <i className="bi bi-chevron-down text-[10px] text-gati-text-light"></i>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 border border-gati-border-color text-center text-gati-text-secondary">
                                  {item.amountPerQuantity}
                                </td>
                                <td className="p-3 border border-gati-border-color text-center">
                                  <div className="relative">
                                    <select
                                      value={item.refundPercentage}
                                      onChange={(e) => handlePercentageChange(item.id, parseInt(e.target.value))}
                                      className="w-full h-[30px] px-2 border border-gati-border-color rounded-sm text-xs text-gati-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-gati-primary focus:border-gati-primary appearance-none cursor-pointer"
                                    >
                                      {generatePercentageOptions().map((pct) => (
                                        <option key={pct} value={pct}>
                                          {pct}%
                                        </option>
                                      ))}
                                    </select>
                                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                                      <i className="bi bi-chevron-down text-[10px] text-gati-text-light"></i>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3 border border-gati-border-color text-center">
                                  <div className="flex flex-col items-center">
                                    <span className={`font-semibold ${item.refundPercentage > 0 ? 'text-green-600' : 'text-gati-text-light'}`}>
                                      {item.refundPercentage > 0 
                                        ? `₹${calculatePercentageRefundAmount(item).toFixed(2)}`
                                        : '0'
                                      }
                                    </span>
                                    {item.refundPercentage > 0 && (
                                      <span className="text-xs text-gati-text-light mt-0.5">
                                        ({item.refundPercentage}% of ₹{item.amountPerQuantity * (item.selectedQuantity || 1)})
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        
                        {/* Total Refund Amount */}
                        <div className="mt-4 flex justify-end">
                          <div className={`p-4 rounded-lg border shadow-sm ${calculateTotalPercentageRefundAmount() > 0 ? 'bg-gradient-to-r from-green-50 to-white border-green-200' : 'bg-gradient-to-r from-gati-background to-white border-gati-border-light'}`}>
                            <div className="flex justify-between items-center gap-6">
                              <span className="text-sm font-medium text-gati-text-primary">Total Refund Amount:</span>
                              <span className={`text-xl font-bold ${calculateTotalPercentageRefundAmount() > 0 ? 'text-green-600' : 'text-gati-text-light'}`}>
                                ₹{calculateTotalPercentageRefundAmount().toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Fault - Only shown when refund type is selected */}
                {showFault && (
                  <div ref={faultRef} className="mb-4">
                    <label className="block text-sm font-medium text-gati-text-primary mb-2">Fault</label>
                    <div className="flex gap-4 flex-wrap">
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${fault === 'merchant_fault' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="fault"
                          value="merchant_fault"
                          checked={fault === 'merchant_fault'}
                          onChange={(e) => handleFaultChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Merchant Fault
                      </label>
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${fault === '3pl_fault' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="fault"
                          value="3pl_fault"
                          checked={fault === '3pl_fault'}
                          onChange={(e) => handleFaultChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        3PL Fault
                      </label>
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${fault === 'customer_fault' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="fault"
                          value="customer_fault"
                          checked={fault === 'customer_fault'}
                          onChange={(e) => handleFaultChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Customer Fault
                      </label>
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${fault === 'exceptional' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="fault"
                          value="exceptional"
                          checked={fault === 'exceptional'}
                          onChange={(e) => handleFaultChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Exceptional
                      </label>
                    </div>
                  </div>
                )}

                {/* Merchant debit options - Only shown when fault is selected */}
                {showMerchantDebit && (
                  <div ref={merchantDebitRef} className="mb-6">
                    <label className="block text-sm font-medium text-gati-text-primary mb-2">Merchant debit options</label>
                    <div className="flex gap-4 flex-wrap">
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${merchantDebit === 'full_debit' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="merchantDebit"
                          value="full_debit"
                          checked={merchantDebit === 'full_debit'}
                          onChange={(e) => handleMerchantDebitChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Full Debit
                      </label>
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${merchantDebit === 'partial_debit' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="merchantDebit"
                          value="partial_debit"
                          checked={merchantDebit === 'partial_debit'}
                          onChange={(e) => handleMerchantDebitChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        Partial Debit
                      </label>
                      <label className={`flex items-center gap-2 border px-3.5 py-2.5 rounded-sm cursor-pointer bg-white flex-1 min-w-[200px] transition-all hover:bg-gati-primary-super-light text-[13px] ${merchantDebit === 'no_debit' ? 'border-gati-primary bg-gati-primary-super-light' : 'border-gati-border-color hover:border-gati-primary'}`}>
                        <input
                          type="radio"
                          name="merchantDebit"
                          value="no_debit"
                          checked={merchantDebit === 'no_debit'}
                          onChange={(e) => handleMerchantDebitChange(e.target.value)}
                          className="w-4 h-4 text-gati-primary border-gati-border-color focus:ring-gati-primary cursor-pointer"
                        />
                        No Debit
                      </label>
                    </div>
                  </div>
                )}

              </>
            )}

            {/* Footer buttons */}
            <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-gati-border-color">
              <button
                onClick={handleModalClose}
                className="px-6 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 border-none rounded-lg font-medium cursor-pointer transition-all text-sm flex items-center gap-2"
              >
                <i className="bi bi-x-lg"></i>
                Close
              </button>
              
              {canCreateRefund && showSubmit && (
                <button
                  ref={submitButtonRef}
                  onClick={handleSubmit}
                  className="px-6 py-2.5 bg-gradient-to-r from-gati-primary to-gati-primary-dark text-white border-none rounded-lg font-semibold cursor-pointer transition-all text-sm flex items-center gap-2"
                >
                  <i className="bi bi-check-circle"></i>
                  Submit Refund
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}