import React from 'react';
import Link from 'next/link';

export default function StoreRegistrationSuccess() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-green-50">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
        <h1 className="text-2xl font-bold text-green-700 mb-4">Registration Successful!</h1>
        <p className="text-green-800 mb-6">Your store registration has been submitted successfully.<br />Our team will review your documents and contact you soon.</p>
        <Link href="/dashboard">
          <span className="inline-block px-6 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition">Go to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}
