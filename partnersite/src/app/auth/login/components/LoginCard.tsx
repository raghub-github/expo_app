'use client';

import React from 'react';

interface LoginCardProps {
  children: React.ReactNode;
}

export function LoginCard({ children }: LoginCardProps) {
  return (
    <div className="relative w-full max-w-[440px] rounded-3xl bg-white shadow-[0_8px_32px_rgba(15,23,42,0.08),0_2px_8px_rgba(15,23,42,0.04)] border border-slate-200/60 overflow-hidden transition-shadow duration-300 hover:shadow-[0_12px_40px_rgba(15,23,42,0.1),0_4px_12px_rgba(15,23,42,0.06)]">
      {children}
    </div>
  );
}
