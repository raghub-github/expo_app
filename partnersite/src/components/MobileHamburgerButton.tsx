'use client';

import React from 'react';
import { MoreVertical } from 'lucide-react';

interface MobileHamburgerButtonProps {
  className?: string;
  /** Light icon/hover for dark header chrome */
  dark?: boolean;
}

export const MobileHamburgerButton: React.FC<MobileHamburgerButtonProps> = ({
  className = '',
  dark = false,
}) => {
  const handleClick = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      window.dispatchEvent(new CustomEvent('openMobileSidebar'));
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`p-1.5 rounded-lg transition-colors flex-shrink-0 md:hidden ${
        dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
      } ${className}`}
      aria-label="Open menu"
    >
      <MoreVertical size={20} className={dark ? 'text-white' : 'text-gray-700'} />
    </button>
  );
};
