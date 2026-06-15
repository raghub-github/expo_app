'use client';

import { Order } from '@/types';

interface OrdersTableProps {
  orders: Order[];
  loading: boolean;
  status: string;
  totalOrders: number;
  onRefresh: () => void;
  onClearFilters: () => void;
}

export default function OrdersTable({
  orders,
  loading,
  status,
  totalOrders,
  onRefresh,
  onClearFilters,
}: OrdersTableProps) {
  const getStatusBadgeClass = (orderStatus: string) => {
    switch (orderStatus) {
      case 'ACCEPTED':
        return 'bg-[#DBEAFE] text-[#1E40AF]';
      case 'PAYMENT DONE':
        return 'bg-[#F3E8FF] text-[#6B21A8]';
      case 'DESPATCH READY':
        return 'bg-[#FEF3C7] text-[#92400E]';
      case 'DESPATCHED':
        return 'bg-[#DCFCE7] text-[#166534]';
      default:
        return 'bg-neutral-light text-neutral-gray';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PAYMENT DONE':
        return 'PD';
      case 'ACCEPTED':
        return 'ACC';
      case 'DESPATCH READY':
        return 'DR';
      case 'DESPATCHED':
        return 'DIS';
      default:
        return status;
    }
  };

  const handleOrderClick = (orderId: string) => {
    window.open(`/orders/${orderId}`, '_blank');
  };

  return (
    <div className="bg-white rounded-lg shadow-default overflow-hidden mb-[25px] border border-[#F1F5F9] overflow-x-auto">
      <div className="p-5 border-b border-[#E2E8F0] flex justify-between items-center flex-wrap gap-[15px] bg-gradient-to-r from-gray-50 to-white">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-bold text-neutral-dark flex items-center gap-2">
            <i className="fas fa-check-circle text-green-500"></i>
            <span>
              {getStatusLabel(status)} - {orders.length} / Out Of {totalOrders}
            </span>
          </h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onRefresh}
            className="bg-primary-mint hover:bg-primary-dark border-primary-mint text-neutral-dark hover:text-white font-semibold py-2.5 px-[18px] rounded-md text-sm transition-all flex items-center gap-2 whitespace-nowrap border"
          >
            <i className="fas fa-sync-alt"></i>
            Refresh Data
          </button>
          <button
            onClick={onClearFilters}
            className="bg-white hover:bg-neutral-light border-[#CBD5E1] text-neutral-dark font-semibold py-2.5 px-[18px] rounded-md text-sm transition-all flex items-center gap-2 whitespace-nowrap border"
          >
            <i className="fas fa-filter"></i>
            Clear All Filters
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-mint mx-auto"></div>
          <p className="mt-4 text-neutral-gray">Loading orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center text-neutral-gray">
          <i className="fas fa-inbox text-5xl mb-4 block"></i>
          No orders found matching your criteria
        </div>
      ) : (
        <table className="w-full border-collapse min-w-[1000px] table-fixed">
          <thead className="bg-neutral-light border-b-2 border-[#E2E8F0]">
            <tr>
              <th className="w-[100px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Order ID
              </th>
              <th className="w-[180px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Action
              </th>
              <th className="w-[200px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Routed To
              </th>
              <th className="w-[150px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Order Time
              </th>
              <th className="w-[150px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                User name
              </th>
              <th className="w-[150px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Updated Time
              </th>
              <th className="w-[120px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                User Mobile
              </th>
              <th className="w-[100px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Merchant ID
              </th>
              <th className="w-[120px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Merchant Mobile
              </th>
              <th className="w-[150px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Merchant Locality
              </th>
              <th className="w-[150px] p-4 text-left font-bold text-neutral-dark text-sm uppercase tracking-wider border-b-2 border-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap">
                Delivery Provider
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                onClick={() => handleOrderClick(order.id)}
                className="border-b border-[#F1F5F9] transition-all cursor-pointer hover:bg-primary-light"
              >
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  <span className={`inline-block px-3.5 py-1.5 rounded-2xl text-xs font-bold text-center uppercase tracking-wide cursor-pointer transition-transform hover:scale-105 whitespace-nowrap ${getStatusBadgeClass(order.status)}`}>
                    {order.orderId}
                  </span>
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.action}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.routedTo}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.orderTime}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.customerName}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.updatedTime}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.customerMobile}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.merchantId}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.merchantMobile}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.merchantLocality}
                </td>
                <td className="p-4 text-sm text-neutral-dark font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-0">
                  {order.deliveryProvider}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
