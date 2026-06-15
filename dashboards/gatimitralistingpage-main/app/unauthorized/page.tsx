'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';

export default function UnauthorizedPage() {
  const router = useRouter();

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
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-neutral-dark mb-2">
            Access Denied
          </h1>
          <p className="text-neutral-gray">
            You don't have permission to access this page.
          </p>
        </div>
        <button
          onClick={() => router.back()}
          className="mt-4 bg-primary-mint hover:bg-primary-dark text-neutral-dark font-semibold py-2 px-6 rounded-lg transition-colors"
        >
          Go Back
        </button>
      </div>
    </div>
  );
}



