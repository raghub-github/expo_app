"use client";
import { Order } from '@/types';

interface CustomerDetailsProps {
  order: Order;
  onCopy: (text: string) => void;
  onPhoneClick: (title: string, phone: string) => void;
}

export default function CustomerDetails({ order, onCopy, onPhoneClick }: CustomerDetailsProps) {
  const userId = order.userId || '2978015';
  const cxDasUrl = `https://customer-dash.gatimitra.com/user-dashboard?category=Food&searchBy=User%20ID&q=${encodeURIComponent(userId)}`;

  const handleViewOnMap = () => {
    const latLon = order.customerLatLon || '28.456007, 77.064804';
    window.open(`https://www.google.com/maps?q=${latLon}`, '_blank', 'noopener');
  };

  return (
    <div className="bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#e5e5e5] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:border-gati-primary/20 hover:-translate-y-0.5">
      <div className="flex justify-between items-start mb-3 pb-2.5 border-b-2 border-[#e5e5e5]">
        <span className="text-base font-bold text-gati-text-primary flex items-center gap-1.5">
          <i className="bi bi-person-circle"></i>
          Customer Details #{order.userId || '2978015'}
        </span>
        <a
          href={cxDasUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-xs px-1.5 py-0.5 rounded bg-gati-primary-super-light border border-gati-primary-light"
        >
          <i className="bi bi-link-45deg"></i>
          Cx-Das
        </a>
      </div>
      <div className="grid gap-1.5">
        {/* Name */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Name:</div>
          <div className="text-[13px] text-gati-text-primary font-medium break-words">{order.customerName || 'Amarjeet Singh'}</div>
        </div>
        {/* Mobile */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[28px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Mobile:</div>
          <div className="text-[13px] text-gati-text-primary font-medium flex items-center gap-1">
            <a
              href={`tel:${order.customerMobile}`}
              onClick={e => {
                e.preventDefault();
                onPhoneClick('Customer Phone', order.customerMobile);
              }}
              className="text-gati-primary no-underline font-medium inline-flex items-center gap-0.5 text-[13px]"
            >
              <i className="bi bi-telephone"></i>
              {order.customerMobile || '+919810223744'}
            </a>
            <button
              type="button"
              className="bi bi-clipboard text-[11px] text-gati-primary cursor-pointer opacity-70 hover:opacity-100 transition-opacity ml-1"
              onClick={() => onCopy(order.customerMobile || '+919810223744')}
              aria-label="Copy customer mobile"
            >
              <span className="sr-only">Copy</span>
            </button>
          </div>
        </div>
        {/* Email */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[28px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Email:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">{order.customerEmail || 'Lalsonsfurnishers@gmail.com'}</div>
        </div>
        {/* Address */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[28px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Address:</div>
          <div className="text-[13px] text-gati-text-primary font-medium flex items-center gap-1">
            {order.customerAddress || 'G 67 4th floor, South city 1 sector 41, Sector 41 Sector 41, Gurugram - 122007'}
            <button
              type="button"
              className="bi bi-clipboard text-[11px] text-gati-primary cursor-pointer opacity-70 hover:opacity-100 transition-opacity ml-1"
              onClick={() => onCopy(order.customerAddress || 'G 67 4th floor, South city 1 sector 41, Sector 41 Sector 41, Gurugram - 122007')}
              aria-label="Copy customer address"
            >
              <span className="sr-only">Copy</span>
            </button>
          </div>
        </div>
        {/* Lat/Lon and View on Map */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[28px]">
          <div className="text-[13px] text-gati-text-secondary font-medium"></div>
          <div className="text-[13px] text-gati-text-primary font-medium flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gati-text-light">
              <b>Lat/Lon: {order.customerLatLon || '28.456007, 77.064804'}</b>
            </span>
            <button
              type="button"
              onClick={handleViewOnMap}
              className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-xs px-1.5 py-0.5 rounded bg-gati-primary-super-light border border-gati-primary-light hover:bg-gati-primary hover:text-white transition-all"
            >
              <i className="bi bi-geo-alt"></i>
              View on Map
            </button>
          </div>
        </div>
        {/* Cx Notifications */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[28px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Cx Notifications:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">
            <a
              href="#"
              target="_blank"
              className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-xs px-1.5 py-0.5 rounded bg-gati-primary-super-light border border-gati-primary-light"
            >
              <i className="bi bi-link-45deg"></i>
              link
            </a>
          </div>
        </div>
        {/* Wallet Link */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[28px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Wallet Link:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">
            <a
              href="#"
              target="_blank"
              className="inline-flex items-center gap-0.5 text-gati-primary no-underline font-medium text-xs px-1.5 py-0.5 rounded bg-gati-primary-super-light border border-gati-primary-light"
            >
              <i className="bi bi-link-45deg"></i>
              link
            </a>
          </div>
        </div>
        {/* User Type */}
        <div className="grid grid-cols-[140px_1fr] items-start min-h-[28px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">User Type:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">
            <span className="bg-gradient-to-br from-gati-primary to-gati-primary-light text-white px-2.5 py-0.5 rounded text-[11px] font-semibold tracking-wide">
              {order.userType}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}