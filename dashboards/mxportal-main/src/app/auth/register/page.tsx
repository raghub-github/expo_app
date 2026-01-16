"use client";
import ParentMerchantForm from '@/components/ParentMerchantForm';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 flex flex-col items-center justify-center">
      <div className="w-full max-w-lg p-8 bg-white rounded-2xl shadow-lg">
        <h1 className="text-3xl font-bold mb-6 text-center text-gray-900">Register Business / Brand</h1>
        <ParentMerchantForm onSuccess={(data) => {
          // Optionally redirect or show next step
          alert('Merchant registered! ID: ' + data.parent_merchant_id);
        }} />
      </div>
    </div>
  );
}

