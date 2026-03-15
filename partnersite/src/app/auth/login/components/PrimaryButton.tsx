'use client';

import React from 'react';

interface PrimaryButtonProps {
  type?: 'button' | 'submit';
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  onClick?: () => void;
}

export function PrimaryButton({
  type = 'button',
  children,
  disabled = false,
  loading = false,
  className = '',
  onClick,
}: PrimaryButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`
        w-full py-3.5 px-4 rounded-xl font-semibold text-sm text-white
        bg-gradient-to-r from-orange-500 to-amber-500
        shadow-md shadow-orange-500/25
        transition-all duration-200 ease-out
        hover:from-orange-600 hover:to-amber-600 hover:shadow-lg hover:shadow-orange-500/30 hover:-translate-y-0.5
        active:translate-y-0 active:shadow
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-md
        focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2
        ${className}
      `.trim()}
    >
      {loading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Please wait...</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
