'use client';

import { useState, useEffect, useRef } from 'react';
import { Order } from '@/types';

interface OrderStatusBlockProps {
  order: Order;
  onStatusUpdate: (status: Order['status']) => void;
}

export default function OrderStatusBlock({ order, onStatusUpdate }: OrderStatusBlockProps) {
  // Initialize status from order prop, but persist updates
  const getInitialStatus = () => {
    if (order.status === 'DESPATCHED') return 'Delivered';
    if (order.status === 'DESPATCH READY') return 'Dispatch Ready';
    if (order.status === 'PAYMENT DONE') return 'Delivered';
    return order.status || 'Delivered';
  };
  
  const [status, setStatus] = useState<string>(getInitialStatus());
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<{ [key: string]: boolean }>({
    'Dispatch Ready': false,
    'Delivered': false,
  });
  const dropdownRef = useRef<HTMLDivElement>(null);

  const statusOptions: string[] = ['Dispatch Ready', 'Delivered'];

  // Sync with order prop when it changes from database
  useEffect(() => {
    const orderStatus = getInitialStatus();
    const persistedStatus = localStorage.getItem(`order-${order.id}-status`);
    
    // If there's a persisted status, use it (user's manual update)
    // Otherwise, use the order status from database
    if (persistedStatus) {
      setStatus(persistedStatus);
    } else if (orderStatus !== status) {
      setStatus(orderStatus);
    }
  }, [order.status, order.id]);

  const handleCheckboxChange = (option: string) => {
    setSelectedStatuses(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  const handleSave = async () => {
    const selected = Object.entries(selectedStatuses).find(([_, checked]) => checked);
    if (selected) {
      let newStatus: Order['status'];
      // Map UI status to database status
      if (selected[0] === 'Dispatch Ready') {
        newStatus = 'DESPATCH READY';
      } else if (selected[0] === 'Delivered') {
        newStatus = 'Delivered';
      } else {
        newStatus = selected[0] as Order['status'];
      }
      setStatus(selected[0]); // Keep UI status for display
      // Save to localStorage for persistence
      localStorage.setItem(`order-${order.id}-status`, selected[0]);
      // Update in database - this will trigger onUpdate which will refresh the order
      await onStatusUpdate(newStatus);
      setShowDropdown(false);
      setSelectedStatuses({
        'Dispatch Ready': false,
        'Delivered': false,
      });
    }
  };

  // Load persisted status on mount, but prefer database value if it's been updated
  useEffect(() => {
    const persistedStatus = localStorage.getItem(`order-${order.id}-status`);
    const orderStatus = getInitialStatus();
    
    // If persisted status exists and matches current order status, keep it
    // Otherwise, use order status from database (it was updated externally)
    if (persistedStatus && persistedStatus === orderStatus) {
      setStatus(persistedStatus);
    } else if (persistedStatus !== orderStatus) {
      // Database has different status, update localStorage and state
      localStorage.setItem(`order-${order.id}-status`, orderStatus);
      setStatus(orderStatus);
    }
  }, [order.id]);

  const handleClose = () => {
    setShowDropdown(false);
    setSelectedStatuses({
      'Dispatch Ready': false,
      'Delivered': false,
    });
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

          return (
            <div className="bg-white rounded-lg p-4 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#e5e5e5] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:border-gati-primary/20">
              <div className="flex items-center justify-between mb-3 flex-wrap">
        <div className="flex items-center gap-6 flex-wrap">
          <span className="bg-gati-primary-light text-white px-3 py-1 rounded-[20px] text-xs font-semibold inline-flex items-center gap-1">
            <i className="bi bi-check-circle"></i>
            Resolved
          </span>
          <div className="flex items-center gap-2 text-sm text-gati-text-secondary">
            <i className="bi bi-ticket-detailed"></i>
            Ticket #<span className="font-semibold text-gati-primary bg-gati-primary-super-light px-2 py-0.5 rounded-sm cursor-pointer">
              592566 <i className="bi bi-chevron-down"></i>
            </span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-5 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-gati-text-secondary whitespace-nowrap">
          Order status: <span className="font-semibold text-gati-text-primary px-2.5 py-1 bg-gati-primary-super-light rounded-sm border-l-[3px] border-gati-primary">{status}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gati-text-secondary whitespace-nowrap">
          Order category: <span className="font-semibold text-gati-text-primary px-2.5 py-1 bg-gati-primary-super-light rounded-sm border-l-[3px] border-gati-primary">{order.category === 'Grocery' ? 'Catalog' : order.category || 'Catalog'}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gati-text-secondary whitespace-nowrap">
          Order Source: <span className="font-semibold text-gati-text-primary px-2.5 py-1 bg-gati-primary-super-light rounded-sm border-l-[3px] border-gati-primary">Customer app</span>
        </div>

        <div className="flex items-center gap-3 whitespace-nowrap ml-auto">
          <div className="text-sm text-gati-text-secondary font-medium flex items-center gap-1.5">
            <i className="bi bi-pencil-square"></i>
            Update order status
          </div>
          <div
            ref={dropdownRef}
            className="min-w-[140px] relative flex items-center justify-between px-3 py-2 bg-white border border-gati-border-color rounded-sm cursor-pointer transition-all"
            onClick={(e) => {
              e.stopPropagation();
              setShowDropdown(!showDropdown);
            }}
          >
            <span className="font-semibold text-gati-text-primary text-sm">{status}</span>
            <i className={`bi bi-chevron-down transition-transform ${showDropdown ? 'rotate-180' : ''}`}></i>
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gati-border-color rounded-sm shadow-[0_4px_12px_rgba(0,0,0,0.15)] z-[100] mt-1 overflow-hidden min-w-[200px]">
                {statusOptions.map((option) => (
                  <div
                    key={option}
                    className="px-3 py-2.5 text-[13px] cursor-pointer transition-all border-b border-[#f0f0f0] last:border-b-0 flex items-center gap-2 hover:bg-gati-primary-super-light"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckboxChange(option);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStatuses[option] || false}
                      onChange={() => handleCheckboxChange(option)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-gati-primary border-gati-border-color rounded focus:ring-gati-primary cursor-pointer"
                    />
                    <span className="text-gati-text-primary">{option}</span>
                  </div>
                ))}
                <div className="flex gap-2 p-2 border-t border-[#f0f0f0]">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClose();
                    }}
                    className="flex-1 px-3 py-2 text-[13px] font-semibold bg-white border border-gati-border-color text-gati-text-primary rounded-sm hover:bg-gati-primary-super-light transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSave();
                    }}
                    className="flex-1 px-3 py-2 text-[13px] font-semibold bg-gati-primary text-white rounded-sm hover:bg-gati-primary-dark transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
