'use client';

import { Order } from '@/types';

interface OrderMetadataProps {
  order: Order;
  onCopy: (text: string) => void;
}

export default function OrderMetadata({ order, onCopy }: OrderMetadataProps) {
  return (
    <div className="bg-white rounded-lg p-4 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#e5e5e5] flex justify-between items-start transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:border-gati-primary/20">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <i className="bi bi-receipt text-lg text-gati-primary"></i>
          <span className="text-xl font-semibold text-gati-primary font-['Poppins',sans-serif]">
            Order #<span>{order.orderId}</span>
          </span>
          <button
            className="inline-flex items-center justify-center w-6 h-6 text-gati-primary cursor-pointer transition-all hover:bg-gati-primary-super-light rounded"
            onClick={() => onCopy(`#${order.orderId}`)}
            title="Copy Order ID"
          >
            <i className="bi bi-clipboard text-sm"></i>
          </button>
        </div>
        <div className="text-[13px] text-gati-text-light flex items-center gap-2">
          <i className="bi bi-clock"></i>
          <span>{order.updatedTime}</span>
          <span> • {order.deliveryType}</span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-3">
        <div className="text-right">
          <div className="text-sm text-gati-text-secondary">
            <i className="bi bi-person-badge"></i>
            Routed To:{' '}
            <span className="font-semibold text-gati-text-primary bg-gati-primary-super-light px-2.5 py-1 rounded-sm border-l-[3px] border-gati-primary">
              {order.routedTo}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
