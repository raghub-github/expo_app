"use client";
import { useState, useEffect } from 'react';

export default function AdminApprovalTable() {
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/store-approval')
      .then((res) => res.json())
      .then((data) => {
        setStores(data.stores || []);
        setLoading(false);
      });
  }, []);

  const handleAction = async (store_id: string, status: string) => {
    const approved_by = prompt('Your name?') || '';
    const approved_by_email = prompt('Your email?') || '';
    let approval_reason = '';
    if (status === 'REJECTED') {
      approval_reason = prompt('Reason for rejection?') || '';
      if (!approval_reason) return alert('Rejection reason required!');
    }
    const res = await fetch('/api/admin/store-approval', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_id,
        approval_status: status,
        approval_reason,
        approved_by,
        approved_by_email,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update.');
    } else {
      alert('Status updated!');
      setStores((prev) => prev.map((s) => (s.store_id === store_id ? { ...s, ...data.store } : s)));
    }
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div style={{ color: 'red' }}>{error}</div>;

  return (
    <table>
      <thead>
        <tr>
          <th>Store Name</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {stores.map((store) => (
          <tr key={store.store_id}>
            <td>{store.store_name}</td>
            <td>{store.approval_status}</td>
            <td>
              <button onClick={() => handleAction(store.store_id, 'APPROVED')}>Approve</button>
              <button onClick={() => handleAction(store.store_id, 'REJECTED')}>Reject</button>
              <button onClick={() => handleAction(store.store_id, 'UNDER_VERIFICATION')}>Mark Under Verification</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
