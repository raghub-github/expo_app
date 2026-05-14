"use client";
import React from 'react';
import { useState } from 'react';
import { offerSchema, OfferInput } from '@/lib/validation/offerSchema';

const initial: OfferInput = {
  store_id: '',
  offer_title: 'New offer',
  offer_type: 'PERCENTAGE',
  offer_sub_type: 'ALL_ORDERS',
  discount_value: 0,
  min_order_amount: undefined,
  valid_from: '',
  valid_till: '',
  is_active: true,
  auto_apply: true,
  is_stackable: false,
  priority: 0,
  first_order_only: false,
  new_user_only: false,
};

export default function OfferForm({ storeId, onSuccess }: { storeId: string; onSuccess: (data: any) => void }) {
  const [form, setForm] = useState<OfferInput>({ ...initial, store_id: storeId });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = offerSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    if (form.offer_sub_type === 'SPECIFIC_ITEM' && (!form.menu_item_ids || form.menu_item_ids.length === 0)) {
      setError('Menu item required for SPECIFIC_ITEM offer');
      return;
    }
    setLoading(true);
    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to create offer.');
    } else {
      onSuccess(data);
    }
  };

  // TODO: Render all offer fields, including conditional item_id

  return (
    <form onSubmit={handleSubmit}>
      {/* Render all offer fields here */}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Create Offer'}</button>
    </form>
  );
}
