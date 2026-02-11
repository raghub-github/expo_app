"use client";

import { useState, useRef, useEffect } from "react";
import { Order } from '@/types';

interface RiderDetailsProps {
  order: Order;
  onCopy: (text: string) => void;
  onPhoneClick: (title: string, phone: string) => void;
  onToast: (message: string) => void;
  onShowRiderLogModal: (show: boolean) => void;
}

// Sample rider log data (exported for modal)
export const riderLogs = [
  {
    createdAt: '2025-12-03 04:22:15',
    provider: 'SHIPROCKET_DIRECT',
    trackingId: '1061706217',
    name: '',
    mobile: '',
    status: 'CANCELLED',
    updatedBy: 'System',
    reason: 'Rider Not Moving',
    distanceCX: '',
    distanceMX: '',
    url: 'https://shiprocket.co/tracking/'
  },
  {
    createdAt: '2025-12-03 03:52:49',
    provider: 'PIDGE_DIRECT',
    trackingId: '1764713267952VNLl33BZ',
    name: '',
    mobile: '',
    status: 'CANCELLED',
    updatedBy: 'System',
    reason: 'Blacklistesd_Rider',
    distanceCX: '',
    distanceMX: '',
    url: 'https://shiprocket.co/tracking/'
  },
  { 
    createdAt: '2025-12-04 08:45:00',
    provider: 'SHIPROCKET_DIRECT',
    trackingId: '1086718138',
    name: 'Ram Yadav',
    mobile: '+917761970466',
    status: 'DELIVERED',
    updatedBy: 'Rider: Form App',
    reason: '',
    distanceCX: '3.57km',
    distanceMX: '1.39km',
    url: 'https://shiprocket.co/tracking/'
  },
];

// Rider Log Modal Component
interface RiderLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (text: string) => void;
}

export function RiderLogModal({ isOpen, onClose, onCopy }: RiderLogModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center transition-all duration-200">
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          maxWidth: '1200px',
          width: '95%',
          marginRight: '15px',
        }}
      >
        {/* Modal Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-emerald-50 to-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <i className="bi bi-person-badge text-emerald-600 text-xl"></i>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-800">Rider Activity Log</h2>
                <p className="text-sm text-gray-500 mt-1">Detailed tracking of all rider assignments and updates</p>
              </div>
            </div>
            <button
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
              onClick={onClose}
              aria-label="Close modal"
            >
              <i className="bi bi-x-lg text-lg"></i>
            </button>
          </div>
        </div>

        {/* Modal Body - Scrollable Table */}
        <div className="flex-1 overflow-auto p-1">
          <div className="p-5">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Created at
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Provider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Tracking ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Mobile
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Updated By
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      Reason
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      CX Distance
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">
                      MX Distance
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {riderLogs.map((log, idx) => (
                    <tr 
                      key={idx} 
                      className={`hover:bg-gray-50 transition-colors ${
                        log.status === 'CANCELLED' ? 'bg-red-50/30' : 
                        log.status === 'DELIVERED' ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                        <div className="font-medium">{log.createdAt.split(' ')[0]}</div>
                        <div className="text-xs text-gray-500">{log.createdAt.split(' ')[1]}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm border-r border-gray-100">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          log.provider.includes('SHIPROCKET') ? 'bg-purple-100 text-purple-800' :
                          log.provider.includes('PIDGE') ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {log.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900 border-r border-gray-100">
                        {log.trackingId}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                        {log.name || (
                          <span className="text-gray-400 italic">Not assigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm border-r border-gray-100">
                        {log.mobile ? (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-900">{log.mobile}</span>
                            <button
                              onClick={() => log.mobile && onCopy(log.mobile)}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Copy number"
                            >
                              <i className="bi bi-clipboard text-xs text-gray-500"></i>
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm border-r border-gray-100">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          log.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                          log.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                        {log.updatedBy}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm border-r border-gray-100">
                        {log.reason ? (
                          <span className="text-red-600 font-medium">{log.reason}</span>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                        {log.distanceCX || (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                        {log.distanceMX || (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {log.url ? (
                          <a
                            href={log.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <i className="bi bi-box-arrow-up-right"></i>
                            Track
                          </a>
                        ) : (
                          <span className="text-gray-400 italic">No URL</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary Footer */}
            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Logs</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{riderLogs.length}</p>
                  </div>
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <i className="bi bi-list-ol text-gray-600 text-xl"></i>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600">Cancelled</p>
                    <p className="text-2xl font-bold text-red-900 mt-1">
                      {riderLogs.filter(log => log.status === 'CANCELLED').length}
                    </p>
                  </div>
                  <div className="p-2 bg-red-100 rounded-lg">
                    <i className="bi bi-x-circle text-red-600 text-xl"></i>
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-600">Delivered</p>
                    <p className="text-2xl font-bold text-emerald-900 mt-1">
                      {riderLogs.filter(log => log.status === 'DELIVERED').length}
                    </p>
                  </div>
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <i className="bi bi-check-circle text-emerald-600 text-xl"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-gray-50 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              <i className="bi bi-info-circle mr-2"></i>
              Showing {riderLogs.length} rider activity records
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RiderDetails({ order, onCopy, onPhoneClick, onToast, onShowRiderLogModal }: RiderDetailsProps) {
  const [riderAttribute, setRiderAttribute] = useState('');
  const [rejectionOptions, setRejectionOptions] = useState<string[]>([]);

  const riderTimeline = [
    { stage: 'Assigned', time: '08:45 AM', mxDistance: '1.39km', cxDistance: '3.57km' },
    { stage: 'Reached Merchant', time: '08:51 AM', mxDistance: '0.05km', cxDistance: '2.22km' },
    { stage: 'Picked Up', time: '09:02 AM', mxDistance: '0.04km', cxDistance: '2.23km' },
    { stage: 'Delivered', time: '09:19 AM', mxDistance: '2.38km', cxDistance: '0.22km' },
  ];

  const handleAttributeChange = (value: string) => {
    setRiderAttribute(value);
    const options: Record<string, string[]> = {
      CUSTOMER: ['Customer denying order', 'Customer non-responsive', 'Wrong user address'],
      RIDER: ['Rider not responding', 'Rider denied order', 'Rider late'],
      MERCHANT: ['Merchant closed', 'Items out of stock', 'Merchant not responding'],
      OTHER: ['Technical issue', 'Weather conditions', 'Other'],
    };
    setRejectionOptions(options[value] || []);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)] w-full" style={{ maxWidth: '800px' }}>
      {/* Header with reduced left gap */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-3 mb-4 border-b border-gray-200 gap-2">
        <div className="flex items-center gap-2 text-base font-bold text-gray-800 ml-0 sm:ml-[-2px]">
          <i className="bi bi-bicycle text-emerald-600 text-xl"></i>
          Rider details
        </div>
        <button
          className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded transition-all"
          onClick={() => onShowRiderLogModal(true)}
        >
          <i className="bi bi-eye"></i>
          View Rider's Log
        </button>
      </div>

      {/* Responsive grid: info left, timeline right - with reduced left gap */}
      <div className="flex flex-col md:flex-row gap-6 w-full">
        {/* Order Info Left - Reduced left gap */}
        <div className="flex-1 min-w-[220px] space-y-3 text-[13px] ml-[-2px]">
          {[
            ['Rider provider:', order.riderProvider],
            ['Rider name:', order.riderName],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-gray-500">{label}</span>
              <span className="text-gray-900 font-medium">{value}</span>
            </div>
          ))}
          {/* Mobile */}
          <div className="flex justify-between">
            <span className="text-gray-500">Mobile number:</span>
            <div className="flex items-center gap-1 text-emerald-600 font-medium">
              <i className="bi bi-telephone"></i>
              {order.riderMobile}
              <i
                className="bi bi-clipboard cursor-pointer text-xs opacity-70 hover:opacity-100"
                onClick={() => order.riderMobile && onCopy(order.riderMobile)}
              />
            </div>
          </div>
          {/* Tracking ID */}
          <div className="flex justify-between">
            <span className="text-gray-500">Tracking Order Id:</span>
            <div className="flex items-center gap-1 font-medium">
              {order.trackingOrderId}
              <i
                className="bi bi-clipboard cursor-pointer text-xs text-emerald-600"
                onClick={() => order.trackingOrderId && onCopy(order.trackingOrderId)}
              />
            </div>
          </div>
          {/* Tracking URL */}
          <div className="flex justify-between">
            <span className="text-gray-500">Tracking URL:</span>
            <a className="text-emerald-600 text-xs font-semibold flex items-center gap-1" href={order.trackingUrl || '#'} target="_blank" rel="noopener noreferrer">
              <i className="bi bi-box-arrow-up-right"></i> View
            </a>
          </div>
          {/* OTP */}
          <div className="flex justify-between items-center">
            <span className="text-gray-500">OTP:</span>
            <div className="px-3 py-1 border border-dashed border-emerald-400 bg-emerald-50 rounded text-emerald-700 font-mono font-semibold tracking-widest">
              {order.otp}
            </div>
          </div>
        </div>
        
        {/* Timeline Right */}
        <div className="flex-1 min-w-[220px]">
          <div className="bg-gray-50 border border-gray-200 rounded-md p-4 h-full flex flex-col">
            <div className="text-sm font-semibold mb-3 flex items-center gap-1">
              <i className="bi bi-clock-history"></i>
              Rider timeline
            </div>
            <div className="grid grid-cols-4 text-center text-[11px] font-semibold mb-3">
              {riderTimeline.map(t => <div key={t.stage}>{t.stage}</div>)}
            </div>
            <div className="relative px-3">
              <div className="absolute top-2 left-3 right-3 h-[2px] bg-emerald-600"></div>
              <div className="grid grid-cols-4 relative">
                <div className="flex flex-row gap-[5px] w-full col-span-4 justify-between">
                  {riderTimeline.map((step, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className="w-3 h-3 bg-emerald-600 rounded-full border-2 border-white"></div>
                      <div className="h-4 w-px bg-gray-300"></div>
                      <div className="text-[11px] font-medium">{step.time}</div>
                      <div className="mt-1 bg-white border border-gray-200 rounded px-2 py-1 text-[10px] text-gray-600 flex flex-col items-center">
                        <span className="whitespace-nowrap">MX – {step.mxDistance}</span>
                        <span className="whitespace-nowrap">CX – {step.cxDistance}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation section with reduced left gap */}
      <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mt-6 ml-[-2px]">
        <div className="text-sm font-semibold mb-3 flex items-center gap-1">
          <i className="bi bi-slash-circle"></i>
          Rider Cancelation
        </div>
        <div className="flex flex-col md:flex-row gap-2">
          <select className="flex-1 h-9 border border-gray-300 rounded px-2 text-sm" onChange={e => handleAttributeChange(e.target.value)}>
            <option value="">Select Attribute</option>
            <option>CUSTOMER</option>
            <option>RIDER</option>
            <option>MERCHANT</option>
            <option>OTHER</option>
          </select>
          <select className="flex-1 h-9 border border-gray-300 rounded px-2 text-sm">
            <option>Select Rejection Option</option>
            {rejectionOptions.map(o => <option key={o}>{o}</option>)}
          </select>
          <select className="flex-1 h-9 border border-gray-300 rounded px-2 text-sm">
            <option>Select Option</option>
            <option>CANCEL</option>
            <option>CANCEL & ASSIGN</option>
          </select>
          <button className="h-9 px-4 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold flex items-center gap-1 mt-2 md:mt-0">
            <i className="bi bi-x-circle"></i>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}