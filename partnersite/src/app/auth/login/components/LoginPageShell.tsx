'use client';

import Link from 'next/link';
import Image from 'next/image';
import { LoginPromoSidebar, type AuthSidebarVariant } from './LoginPromoSidebar';
import { PartnerPlatformAgreementNotice } from '@/components/legal/PartnerPlatformAgreementNotice';

interface LoginPageShellProps {
  children: React.ReactNode;
  /** Wider form area for multi-step registration */
  contentMaxWidthClass?: string;
  headerPrompt?: string;
  headerLinkLabel?: string;
  headerLinkHref?: string;
  sidebarVariant?: AuthSidebarVariant;
}

export function LoginPageShell({
  children,
  contentMaxWidthClass = 'max-w-md',
  headerPrompt = "Don\u2019t have an account?",
  headerLinkLabel = 'Sign Up',
  headerLinkHref = '/auth/register',
  sidebarVariant = 'login',
}: LoginPageShellProps) {
  return (
    <div className="min-h-screen flex bg-white">
      <div className="flex flex-1 flex-col min-h-screen min-w-0">
        <header className="flex items-center justify-between gap-4 px-6 sm:px-8 lg:px-10 py-5 border-b border-slate-100">
          <Link href="/auth" className="flex items-center shrink-0">
            <Image
              src="/logo.png"
              alt="GatiMitra"
              width={140}
              height={40}
              className="h-9 w-auto object-contain"
              priority
            />
          </Link>
          <p className="text-sm text-slate-600 text-right">
            {headerPrompt}{' '}
            <Link
              href={headerLinkHref}
              className="font-semibold text-orange-600 hover:text-orange-700 hover:underline"
            >
              {headerLinkLabel}
            </Link>
          </p>
        </header>

        <div className={`flex flex-1 items-center justify-center px-6 sm:px-8 lg:px-10 py-8 ${contentMaxWidthClass === 'max-w-md' ? '' : 'items-start lg:items-center'}`}>
          <div className={`w-full ${contentMaxWidthClass}`}>{children}</div>
        </div>

        <footer className="px-6 sm:px-8 lg:px-10 py-6 border-t border-slate-100">
          <PartnerPlatformAgreementNotice />
          <p className="mt-3 text-center text-xs text-slate-400">
            <Link href="/auth" className="hover:text-slate-600 hover:underline">
              Back to home
            </Link>
          </p>
        </footer>
      </div>

      <LoginPromoSidebar variant={sidebarVariant} />
    </div>
  );
}
