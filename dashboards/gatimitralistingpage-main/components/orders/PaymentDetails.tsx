'use client';

import { useRef, useEffect } from 'react';

interface PaymentDetailsProps {
  onShowPaymentDetailsModal: (show: boolean) => void;
}

interface PaymentRecord {
  paymentId: string;
  transactionId?: string;
  mpTransactionId?: string;
  paymentStatus: string;
  redemptionType: string;
  productType: string;
  refunded: boolean;
  partialRefunded: boolean;
  amount?: number;
  deliveryFee?: number;
  ctc?: number;
  casish?: number;
  pointsUsed?: number;
  ctm?: number;
  cts?: number;
}

// Exported payment data for modal
export const paymentData: PaymentRecord[] = [
  {
    paymentId: '264225646',
    transactionId: '241113600',
    mpTransactionId: '150874118e0d2f9a8b',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'MAGIC_PRO',
    refunded: true,
    partialRefunded: true,
    amount: 3.54,
    deliveryFee: 60,
    ctc: 3.54,
    casish: 3.54
  },
  {
    paymentId: '264225647',
    transactionId: '241113621',
    mpTransactionId: '150874118e0d2f9a8b',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'Delivery',
    refunded: true,
    partialRefunded: true,
    amount: 2180,
    deliveryFee: 60,
    ctc: 2180,
    casish: 798.68,
    pointsUsed: 1477
  },
  {
    paymentId: '264225648',
    transactionId: '241113622',
    mpTransactionId: '150874118e0d2f9a8b',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'DELIVERY_OTHER',
    refunded: true,
    partialRefunded: true,
    amount: 38.15,
    deliveryFee: 60,
    ctc: 38.15,
    casish: 38.15
  },
  {
    paymentId: '264225649',
    transactionId: '241113623',
    mpTransactionId: '150874118e0d2f9a8b',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'DELIVERY_CHARGE',
    refunded: true,
    partialRefunded: true,
    amount: 60
  },
  {
    paymentId: '264225630',
    transactionId: '241113624',
    mpTransactionId: '150874118e0d2f9a8b',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'DELIVERY_FEE',
    refunded: true,
    partialRefunded: true,
    amount: 60,
    ctc: 10
  },
  {
    paymentId: '264225631',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'Delivery',
    refunded: false,
    partialRefunded: false,
    ctm: 2103.7
  },
  {
    paymentId: '264225632',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'DELIVERY_OTHER',
    refunded: false,
    partialRefunded: false,
    ctm: 88.15
  },
  {
    paymentId: '264225638',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'DELIVERY_CHARGE',
    refunded: false,
    partialRefunded: false
  },
  {
    paymentId: '264225634',
    paymentStatus: 'refunded',
    redemptionType: 'MAGICPW',
    productType: 'DELIVERY_FEE',
    refunded: false,
    partialRefunded: false
  }
];

// Helper function for currency formatting
const formatCurrency = (value?: number) => {
  if (value === undefined) return '-';
  return `₹${value.toLocaleString('en-IN')}`;
};

// Payment Details Modal Component
interface PaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PaymentDetailsModal({ isOpen, onClose }: PaymentDetailsModalProps) {
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
        <div className="flex justify-between items-center p-6 border-b border-[#e5e5e5] bg-gradient-to-r from-emerald-50 to-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <i className="bi bi-receipt text-emerald-600 text-xl"></i>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">Payment Details</h3>
              <p className="text-sm text-gray-500 mt-1">Detailed breakdown of all transactions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-700"
            aria-label="Close modal"
          >
            <i className="bi bi-x-lg text-lg"></i>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto p-6">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Payment Id</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Transaction Id</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">MP TransactionId</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Payment Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Redemption Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Product Type</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Refunded</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Partial Refunded</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Amount</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wider border-b border-gray-200 whitespace-nowrap">Delivery Fee</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {paymentData.map((record, index) => (
                  <tr 
                    key={record.paymentId} 
                    className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
                  >
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">{record.paymentId}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{record.transactionId || '-'}</td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-mono">{record.mpTransactionId || '-'}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        record.paymentStatus === 'refunded' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        <i className={`bi ${record.paymentStatus === 'refunded' ? 'bi-arrow-clockwise' : 'bi-check-circle'}`}></i>
                        {record.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">{record.redemptionType}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{record.productType}</td>
                    <td className="py-3 px-4">
                      {record.refunded ? (
                        <span className="inline-flex items-center gap-1 text-sm text-emerald-600 font-medium">
                          <i className="bi bi-check-circle"></i> Yes
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {record.partialRefunded ? (
                        <span className="inline-flex items-center gap-1 text-sm text-amber-600 font-medium">
                          <i className="bi bi-check-circle"></i> Yes
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-900 font-medium">{formatCurrency(record.amount)}</td>
                    <td className="py-3 px-4 text-sm text-gray-900">{formatCurrency(record.deliveryFee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Section */}
          <div className="mt-6 p-5 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-bold text-gray-800 mb-4">Summary</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Transactions</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{paymentData.length}</p>
                  </div>
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <i className="bi bi-list-ol text-gray-600 text-xl"></i>
                  </div>
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">₹2,646.77</p>
                  </div>
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <i className="bi bi-currency-rupee text-emerald-600 text-xl"></i>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600">Refunded Items</p>
                    <p className="text-2xl font-bold text-red-900 mt-1">5</p>
                  </div>
                  <div className="p-2 bg-red-100 rounded-lg">
                    <i className="bi bi-arrow-clockwise text-red-600 text-xl"></i>
                  </div>
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Delivery Charges</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">₹0</p>
                  </div>
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <i className="bi bi-truck text-blue-600 text-xl"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 border-t border-gray-200 bg-gray-50 px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="text-sm text-gray-500">
              <i className="bi bi-info-circle mr-2"></i>
              <span className="font-medium text-gray-700">Note:</span> All amounts are in INR
            </div>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Close
              </button>
              <button className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors inline-flex items-center gap-2">
                <i className="bi bi-download"></i>
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaymentDetails({ onShowPaymentDetailsModal }: PaymentDetailsProps) {
  const handleMoreDetails = () => {
    onShowPaymentDetailsModal(true);
  };

  // Check if order is refunded (based on payment data)
  const isRefunded = paymentData.some(record => record.refunded);

  return (
    <div className="h-full bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#e5e5e5] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:border-gati-primary/20 hover:-translate-y-0.5">
      <div className="flex justify-between items-start mb-3 pb-2.5 border-b-2 border-[#e5e5e5]">
        <div className="text-base font-bold text-gati-text-primary flex items-center gap-1.5">
          <i className="bi bi-credit-card"></i>
          <span>Payment details</span>
        </div>
        {isRefunded && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
            <i className="bi bi-arrow-clockwise"></i>
            Refunded
          </span>
        )}
      </div>
      <div className="grid gap-1.5">
        <div className="grid grid-cols-[180px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Total Amount:</div>
          <div className="text-[13px] text-gati-text-primary font-semibold">
            ₹2646.77
            <span className="text-xs text-gati-text-secondary font-normal ml-1">
              (<span className="text-gati-primary font-medium">Cashin ₹2526.44</span>
              <span> <b>+ MitraCash ₹33</b></span>
              <span> <b>+ 123.91 </b><i className="bi bi-star-fill text-gati-warning"></i></span>)
            </span>
          </div>
        </div>
        <div className="grid grid-cols-[180px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Total CTM:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">₹2500.68</div>
        </div>
        <div className="grid grid-cols-[180px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Total Cashback Earned:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">25</div>
        </div>
        <div className="grid grid-cols-[180px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Delivery Fee:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">0</div>
        </div>
        <div className="grid grid-cols-[180px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Source:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">UPI</div>
        </div>
        <div className="grid grid-cols-[180px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Payment Mode:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">
            <span className="bg-gati-primary text-white px-2.5 py-0.5 rounded text-[11px] font-semibold inline-block">
              ONLINE
            </span>
          </div>
        </div>
      </div>
      <p
        onClick={handleMoreDetails}
        className="mt-3 text-gati-primary font-medium cursor-pointer inline-flex items-center gap-1 transition-colors text-[13px] hover:text-gati-primary/80"
      >
        <i className="bi bi-chevron-right"></i>
        More Details
      </p>
    </div>
  );
}
