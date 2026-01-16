"use client";
import React from 'react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { parentMerchantSchema, ParentMerchantInput } from '@/lib/validation/parentMerchantSchema';

// Utility to get parent_id from URL
function getParentId() {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('parent_id');
  }
  return null;
}

export default function ParentMerchantForm({ verifiedPhone, onSuccess }: { verifiedPhone?: string, onSuccess: (data: any) => void }) {
  const parentId = getParentId();
  const [step, setStep] = useState(() => {
    if (typeof window !== 'undefined' && parentId) {
      const saved = localStorage.getItem(`parent_onboarding_${parentId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.step || 1;
        } catch {}
      }
    }
    return 1;
  });
  const [form, setForm] = useState<any>(() => {
    if (typeof window !== 'undefined' && parentId) {
      const saved = localStorage.getItem(`parent_onboarding_${parentId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          return parsed.form || {
            parent_name: '',
            merchant_type: 'LOCAL',
            owner_name: '',
            owner_email: '',
            registered_phone: verifiedPhone || '',
            registered_phone_normalized: verifiedPhone || '',
            alternate_phone: '',
            brand_name: '',
            business_category: '',
            is_active: true,
            registration_status: 'VERIFIED',
            address_line1: '',
            city: '',
            state: '',
            pincode: '',
          };
        } catch {}
      }
    }
    return {
      parent_name: '',
      merchant_type: 'LOCAL',
      owner_name: '',
      owner_email: '',
      registered_phone: verifiedPhone || '',
      registered_phone_normalized: verifiedPhone || '',
      alternate_phone: '',
      brand_name: '',
      business_category: '',
      is_active: true,
      registration_status: 'VERIFIED',
      address_line1: '',
      city: '',
      state: '',
      pincode: '',
    };
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const validatePhone = (phone: string) => {
    return /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    let updatedForm;
    if (["registered_phone", "alternate_phone", "pincode"].includes(name)) {
      const digits = value.replace(/\D/g, '');
      updatedForm = { ...form, [name]: digits };
      setForm(updatedForm);
    } else {
      updatedForm = { ...form, [name]: value };
      setForm(updatedForm);
    }
    // Save to localStorage
    if (typeof window !== 'undefined' && parentId) {
      localStorage.setItem(`parent_onboarding_${parentId}`, JSON.stringify({ form: updatedForm, step }));
    }
  };

  const handleNextStep = () => {
    if (typeof window !== 'undefined' && parentId) {
      localStorage.setItem(`parent_onboarding_${parentId}`, JSON.stringify({ form, step: step + 1 }));
    }
    if (step === 1) {
      if (!form.parent_name.trim()) {
        setError('Parent name is required');
        return;
      }
      if (!form.business_category) {
        setError('Business category is required');
        return;
      }
      if (!form.registered_phone) {
        setError('Registered phone is required');
        return;
      }
      if (!validatePhone(form.registered_phone)) {
        setError('Enter a valid 10-digit Indian mobile number');
        return;
      }
      setError(null);
      setStep(2);
    } else if (step === 2) {
      if (!form.address_line1) {
        setError('Address Line 1 is required');
        return;
      }
      if (!form.city) {
        setError('City is required');
        return;
      }
      if (!form.state) {
        setError('State is required');
        return;
      }
      if (!form.pincode || form.pincode.length < 5) {
        setError('Valid pincode is required');
        return;
      }
      setError(null);
      setStep(3);
    }
  };

  const handlePrevStep = () => {
    const newStep = step === 2 ? 1 : 2;
    setStep(newStep);
    setError(null);
    if (typeof window !== 'undefined' && parentId) {
      localStorage.setItem(`parent_onboarding_${parentId}`, JSON.stringify({ form, step: newStep }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.owner_name || typeof form.owner_name !== 'string' || !form.owner_name.trim()) {
      setError('Owner name is required');
      return;
    }
    if (!form.owner_email || typeof form.owner_email !== 'string' || !form.owner_email.trim()) {
      setError('Owner email is required');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.owner_email)) {
      setError('Enter a valid email address');
      return;
    }
    if (!form.registration_status || !['VERIFIED', 'SUSPENDED'].includes(form.registration_status)) {
      setError('Registration status must be VERIFIED or SUSPENDED');
      return;
    }

    const normalizedPhone = form.registered_phone.replace(/\D/g, '');
    const finalFormData = {
      ...form,
      registered_phone: normalizedPhone,
      registered_phone_normalized: normalizedPhone,
      parent_merchant_id: '',
      is_active: true,
    };

    const parsed = parentMerchantSchema.safeParse(finalFormData);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    // Clear localStorage for this parent_id after successful submit
    try {
      const res = await fetch('/api/parent-merchant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalFormData),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error || 'Failed to register.');
        return;
      }
      if (data.info) {
        if (data.info.includes('mobile number') && data.parent_merchant_id) {
          onSuccess({ parent_merchant_id: data.parent_merchant_id, info: data.info });
          return;
        }
        if (data.info.includes('email')) {
          setInfo('This email address is already registered.');
          return;
        }
      }
      onSuccess(data);
      if (typeof window !== 'undefined' && parentId) {
        localStorage.removeItem(`parent_onboarding_${parentId}`);
      }
    } catch (err) {
      setLoading(false);
      setError('Network error. Please try again.');
    }
  };

  return (
    <div className="w-full">
      {/* Stepper */}
      <div className="flex items-center justify-center space-x-6 mb-6">
        <div className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 text-sm font-bold transition-all duration-200 ${step === 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600'}`}>1</div>
          <span className={`text-sm font-semibold ${step === 1 ? 'text-blue-700' : 'text-gray-500'}`}>Business</span>
        </div>
        <div className="w-10 h-1 bg-gradient-to-r from-blue-400 to-blue-200 rounded-full" />
        <div className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 text-sm font-bold transition-all duration-200 ${step === 2 ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600'}`}>2</div>
          <span className={`text-sm font-semibold ${step === 2 ? 'text-blue-700' : 'text-gray-500'}`}>Address</span>
        </div>
        <div className="w-10 h-1 bg-gradient-to-r from-blue-400 to-blue-200 rounded-full" />
        <div className="flex items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-2 text-sm font-bold transition-all duration-200 ${step === 3 ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600'}`}>3</div>
          <span className={`text-sm font-semibold ${step === 3 ? 'text-blue-700' : 'text-gray-500'}`}>Contact</span>
        </div>
      </div>

      {/* Info message for email match */}
      {info && (
        <div className="p-3 mb-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
          <p className="text-sm text-blue-700 font-medium">{info}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} autoComplete="off" className="w-full">
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Parent Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Parent Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="parent_name"
                  value={form.parent_name}
                  onChange={handleChange}
                  required
                  type="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                  placeholder="Enter parent company name"
                />
              </div>
              
              {/* Business Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="business_category"
                  value={form.business_category}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white appearance-none text-sm"
                >
                  <option value="" className="text-gray-400">Select Category</option>
                  <option value="Food">Food</option>
                  <option value="Pharma">Pharma</option>
                  <option value="Grocery">Grocery</option>
                  <option value="Stationary">Stationary</option>
                  <option value="Bakery">Bakery</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Fashion">Fashion</option>
                  <option value="Home Decor">Home Decor</option>
                </select>
              </div>
              
              {/* Merchant Type */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Merchant Type <span className="text-red-500">*</span>
                </label>
                <div className="flex space-x-6">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="merchant_type"
                      value="LOCAL"
                      checked={form.merchant_type === 'LOCAL'}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-gray-700 text-sm">LOCAL</span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="merchant_type"
                      value="BRAND"
                      checked={form.merchant_type === 'BRAND'}
                      onChange={handleChange}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-gray-700 text-sm">BRAND</span>
                  </label>
                </div>
              </div>

              {/* Brand Name (Conditional) */}
              {form.merchant_type === 'BRAND' && (
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Brand Name
                  </label>
                  <input
                    name="brand_name"
                    value={form.brand_name}
                    onChange={handleChange}
                    type="text"
                    autoComplete="off"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                    placeholder="Enter brand name"
                  />
                </div>
              )}

              {/* Registered Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registered Phone <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm">
                    +91
                  </div>
                  <input
                    name="registered_phone"
                    value={form.registered_phone}
                    readOnly
                    required
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    autoComplete="off"
                    className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 bg-gray-100 cursor-not-allowed text-sm"
                    placeholder="10-digit number"
                  />
                </div>
              </div>

              {/* Alternate Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alternate Phone
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 text-sm">
                    +91
                  </div>
                  <input
                    name="alternate_phone"
                    value={form.alternate_phone}
                    onChange={handleChange}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={10}
                    autoComplete="off"
                    className="w-full pl-12 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                    placeholder="10-digit number"
                  />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Step 1 Button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleNextStep}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Address Line 1 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Address <span className="text-red-500">*</span>
                </label>
                <input
                  name="address_line1"
                  value={form.address_line1}
                  onChange={handleChange}
                  required
                  type="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                  placeholder="Enter address"
                />
              </div>
              {/* City */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  name="city"
                  value={form.city}
                  onChange={handleChange}
                  required
                  type="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                  placeholder="Enter city"
                />
              </div>
              {/* State */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State <span className="text-red-500">*</span>
                </label>
                <input
                  name="state"
                  value={form.state}
                  onChange={handleChange}
                  required
                  type="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                  placeholder="Enter state"
                />
              </div>
              {/* Pincode */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pincode <span className="text-red-500">*</span>
                </label>
                <input
                  name="pincode"
                  value={form.pincode}
                  onChange={handleChange}
                  required
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                  placeholder="Enter pincode"
                />
              </div>
            </div>

            {/* Step 2 Buttons */}
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Next
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg mt-2">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Owner Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner Name <span className="text-red-500">*</span>
                </label>
                <input
                  name="owner_name"
                  value={form.owner_name}
                  onChange={handleChange}
                  required
                  type="text"
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                  placeholder="Full name"
                />
              </div>

              {/* Owner Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Owner Email <span className="text-red-500">*</span>
                </label>
                <input
                  name="owner_email"
                  value={form.owner_email}
                  onChange={handleChange}
                  type="email"
                  required
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 text-sm"
                  placeholder="email@example.com"
                />
              </div>

            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Step 3 Buttons */}
            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={handlePrevStep}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Registering...' : 'Complete Registration'}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}