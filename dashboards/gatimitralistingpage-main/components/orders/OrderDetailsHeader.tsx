'use client';

import Image from 'next/image';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';

export default function OrderDetailsHeader() {
  const { user } = useSelector((state: RootState) => state.auth);

  return (
    <header className="sticky top-0 z-[1000] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)] h-[60px] border-b border-[#f0f0f0]">
      <div className="w-full px-6" style={{ overflow: 'visible', position: 'relative' }}>
        <section className="flex items-center justify-between h-[60px] max-w-[1400px] mx-auto" style={{ position: 'relative' }}>
          <div className="header-logo flex items-center" style={{ overflow: 'visible', position: 'relative', zIndex: 10, minWidth: '300px' }}>
            <div className="logo" style={{ overflow: 'visible', position: 'relative', width: '100%' }}>
              <img
                src="/img/logo.png"
                alt="GatiMitra Logo"
                className="logo-img"
                style={{
                  marginTop: '10px',
                  height: '200px',
                  width: 'auto',
                  marginLeft: '-280px',
                  display: 'block',
                  position: 'relative',
                  zIndex: 10,
                  visibility: 'visible',
                  opacity: 1,
                  maxWidth: 'none'
                }}
                onError={(e) => {
                  console.error('Logo failed to load:', e);
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
                onLoad={() => {
                  console.log('Logo loaded successfully');
                }}
              />
            </div>
          </div>
          <div className="header-login">
            <ul className="flex items-center gap-3 list-none m-0 p-0">
              <li className="w-9 h-9 bg-gradient-to-br from-gati-primary to-gati-primary-light text-white rounded-full flex items-center justify-center font-semibold text-sm shadow-[0_2px_4px_rgba(0,0,0,0.08)]">
                {user?.email?.charAt(0).toUpperCase() || 'G'}
              </li>
              <li className="text-sm text-gati-text-secondary font-medium max-w-[200px] whitespace-nowrap overflow-hidden text-ellipsis">
                {user?.email || 'agent@gatimitra.in'}
              </li>
            </ul>
          </div>
        </section>
      </div>
    </header>
  );
}
