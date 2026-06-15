'use client';

import Image from 'next/image';

export default function PendingApprovalPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-light to-white p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="flex justify-center mb-6">
          <Image
            src="/img/logo.png"
            alt="GatiMitra Logo"
            width={150}
            height={60}
            className="object-contain"
          />
        </div>
        <div className="mb-4">
          <div className="w-16 h-16 bg-primary-light rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-primary-dark"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-dark mb-2">
            Account Pending Approval
          </h1>
          <p className="text-neutral-gray">
            Your account has been created successfully. Please wait for Super Admin approval before accessing the dashboard.
          </p>
        </div>
        <a
          href="/login"
          className="inline-block mt-4 text-primary-dark font-semibold hover:underline"
        >
          Back to Login
        </a>
      </div>
    </div>
  );
}



