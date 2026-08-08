'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LoginPromoSidebar, type AuthSidebarVariant } from './LoginPromoSidebar';
import { GM_LINK } from './gatimitra-brand';
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
  contentMaxWidthClass = 'max-w-2xl',
  headerPrompt = "Don\u2019t have an account?",
  headerLinkLabel = 'Sign Up',
  headerLinkHref = '/auth/register',
  sidebarVariant = 'login',
}: LoginPageShellProps) {
  const isWide = contentMaxWidthClass === 'max-w-none';

  // Prevent page-level scroll; only the middle pane may scroll if content truly overflows
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-slate-50">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={`flex shrink-0 items-center justify-between gap-4 border-b border-slate-200/60 bg-white/80 px-6 backdrop-blur-sm sm:px-8 lg:px-10 ${
            isWide ? 'py-2.5' : 'py-4'
          }`}
        >
          <Link href="/auth" className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="GatiMitra"
              width={140}
              height={40}
              className={`w-auto object-contain ${isWide ? 'h-8' : 'h-9'}`}
              priority
            />
          </Link>
          <p className="text-right text-sm text-slate-600">
            {headerPrompt}{' '}
            <Link
              href={headerLinkHref}
              className={`font-semibold hover:underline ${GM_LINK}`}
            >
              {headerLinkLabel}
            </Link>
          </p>
        </header>

        <div
          className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
            isWide ? 'bg-white' : 'bg-gradient-to-br from-slate-50 via-white to-[#E5F5F0]/50'
          }`}
        >
          <div
            className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain ${
              isWide
                ? 'px-6 py-3 sm:px-8 sm:py-4 lg:px-10'
                : 'px-4 py-5 sm:px-8 sm:py-6 lg:px-10'
            }`}
          >
            <div
              className={`mx-auto w-full ${isWide ? 'flex min-h-full flex-col pb-4' : 'pb-6 sm:pb-8'} ${contentMaxWidthClass}`}
            >
              {isWide ? (
                children
              ) : (
                <div className="w-full rounded-2xl border-2 border-slate-200 bg-white px-6 py-6 sm:px-10 sm:py-8">
                  {children}
                </div>
              )}
            </div>
          </div>
        </div>

        <footer
          className={`shrink-0 border-t border-slate-200/60 bg-white px-6 sm:px-8 lg:px-10 ${
            isWide ? 'py-2.5' : 'py-3 sm:py-4'
          }`}
        >
          <PartnerPlatformAgreementNotice className={isWide ? 'leading-snug' : ''} />
          <p className={`text-center text-xs text-slate-400 ${isWide ? 'mt-1' : 'mt-2'}`}>
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
