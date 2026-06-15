import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { mockPersonOrders } from '@/components/orders/PersonDashboard';

export default function PersonOrderDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const orderId = params?.id as string;
  const order = mockPersonOrders.find(o => o.orderId === orderId);

  useEffect(() => {
    if (!order) router.replace('/orders/person');
  }, [order, router]);

  if (!order) return null;

  return (
    <div className="max-w-2xl mx-auto p-8 bg-white rounded shadow mt-8">
      <h2 className="text-2xl font-bold mb-4">Person Ride Order Details</h2>
      <div className="mb-2"><strong>Order ID:</strong> {order.orderId}</div>
      <div className="mb-2"><strong>Action:</strong> {order.action}</div>
      <div className="mb-2"><strong>Routed To:</strong> {order.routedTo}</div>
      <div className="mb-2"><strong>Order Time:</strong> {order.orderTime}</div>
      <div className="mb-2"><strong>Updated Time:</strong> {order.updatedTime}</div>
      <div className="mb-2"><strong>Customer Name:</strong> {order.customerName}</div>
      <div className="mb-2"><strong>Customer Mobile:</strong> {order.customerMobile}</div>
      <div className="mb-2"><strong>Merchant ID:</strong> {order.merchantId}</div>
      <div className="mb-2"><strong>Merchant Mobile:</strong> {order.merchantMobile}</div>
      <div className="mb-2"><strong>Merchant Locality:</strong> {order.merchantLocality}</div>
      <div className="mb-2"><strong>Delivery Provider:</strong> {order.deliveryProvider}</div>
      <div className="mb-2"><strong>Status:</strong> {order.status}</div>
      <div className="mb-2"><strong>Category:</strong> {order.category}</div>
      <div className="mb-2"><strong>Delivery Type:</strong> {order.deliveryType}</div>
      <div className="mb-2"><strong>User Type:</strong> {order.userType}</div>
      <div className="mb-2"><strong>Department:</strong> {order.department}</div>
      <button className="mt-6 px-4 py-2 bg-primary-mint text-white rounded" onClick={() => router.back()}>
        Back
      </button>
    </div>
  );
}
