"use client";
import React from 'react';
import { useState } from 'react';
import { customizationSchema, addonSchema, CustomizationInput, AddonInput } from '@/lib/validation/customizationSchema';

export default function CustomizationForm({ itemId, onSuccess }: { itemId: string; onSuccess: (data: any) => void }) {
  const [custom, setCustom] = useState<CustomizationInput>({
    item_id: itemId,
    title: '',
    required: false,
    max_selection: undefined,
  });
  const [addon, setAddon] = useState<AddonInput>({
    customization_id: '',
    addon_name: '',
    addon_price: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustom({ ...custom, [e.target.name]: e.target.value });
  };
  const handleAddonChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAddon({ ...addon, [e.target.name]: e.target.value });
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = customizationSchema.safeParse(custom);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const res = await fetch('/api/customizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'customization', data: custom }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add customization.');
    } else {
      onSuccess(data);
    }
  };

  const handleAddonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = addonSchema.safeParse(addon);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }
    setLoading(true);
    const res = await fetch('/api/customizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'addon', data: addon }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || 'Failed to add addon.');
    } else {
      onSuccess(data);
    }
  };

  return (
    <div>
      <form onSubmit={handleCustomSubmit}>
        <h3>Add Customization</h3>
        <input name="title" value={custom.title} onChange={handleCustomChange} placeholder="Title" />
        <label>
          <input type="checkbox" name="required" checked={custom.required} onChange={e => setCustom({ ...custom, required: e.target.checked })} />
          Required
        </label>
        <input name="max_selection" type="number" value={custom.max_selection || ''} onChange={handleCustomChange} placeholder="Max Selection" />
        <button type="submit" disabled={loading}>Add Customization</button>
      </form>
      <form onSubmit={handleAddonSubmit}>
        <h3>Add Add-on</h3>
        <input name="customization_id" value={addon.customization_id} onChange={handleAddonChange} placeholder="Customization ID" />
        <input name="addon_name" value={addon.addon_name} onChange={handleAddonChange} placeholder="Add-on Name" />
        <input name="addon_price" type="number" value={addon.addon_price} onChange={handleAddonChange} placeholder="Add-on Price" />
        <button type="submit" disabled={loading}>Add Add-on</button>
      </form>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </div>
  );
}
