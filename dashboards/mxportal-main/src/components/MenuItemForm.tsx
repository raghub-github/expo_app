"use client";
import { useState } from 'react';
import { menuItemSchema, MenuItemInput } from '@/lib/validation/menuItemSchema';

const initial: MenuItemInput = {
  store_id: '',
  item_name: '',
  description: '',
  category_type: '',
  food_category_item: '',
  actual_price: 0,
  offer_price: undefined,
  in_stock: true,
  has_customization: false,
  has_addons: false,
  image_url: '',
};

export default function MenuItemForm({ storeId, onSuccess }: { storeId: string; onSuccess: (data: any) => void }) {
  const [form, setForm] = useState<MenuItemInput>({ ...initial, store_id: storeId });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // TODO: Add R2 upload logic for image and set signed URL in form state

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = menuItemSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add menu item.');
    } else {
      onSuccess(data);
    }
  };

  // TODO: Render form fields for all menu item properties

  return (
    <form onSubmit={handleSubmit}>
      {/* Render all form fields here */}
      {error && <div style={{ color: 'red' }}>{error}</div>}
      <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Add Menu Item'}</button>
    </form>
  );
}
