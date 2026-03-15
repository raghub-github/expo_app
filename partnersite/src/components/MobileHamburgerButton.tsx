'use client';

import React from 'react';
import { MoreVertical } from 'lucide-react';

interface MobileHamburgerButtonProps {
  className?: string;
}

export const MobileHamburgerButton: React.FC<MobileHamburgerButtonProps> = ({ className = '' }) => {
  const handleClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.dispatchEvent(new CustomEvent('openMobileSidebar'));
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0 md:hidden ${className}`}
      aria-label="Open menu"
    >
      <MoreVertical size={20} className="text-gray-700" />
    </button>
  );
};
