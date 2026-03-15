'use client';

import React from 'react';

interface DividerWithTextProps {
  text: string;
}

export function DividerWithText({ text }: DividerWithTextProps) {
  return (
    <div className="relative flex items-center gap-4">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
      <span className="text-xs font-medium text-slate-500 uppercase tracking-wider shrink-0">{text}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
    </div>
  );
}
