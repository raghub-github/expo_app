'use client';

import React, { createContext, useContext, useEffect, useLayoutEffect } from 'react';

/** Props a page hands to the persistent partner shell (top bar + left sidebar). */
export type PartnerShellRegistration = {
  restaurantName?: string;
  restaurantId?: string;
  sidebarPosition?: 'left' | 'right';
  leftSidebarCollapsed?: boolean;
  mobileMenuExtra?: React.ReactNode;
  sidebarFilters?: React.ReactNode;
  hideHelpBadge?: boolean;
  headerTitle?: string;
};

type PartnerShellFrameContextValue = {
  /** Publish the current page's shell props. `token` identifies the calling page instance. */
  registerPartnerShell: (token: symbol, next: PartnerShellRegistration) => void;
  /** Drop the registration, but only if `token` is still the active one. */
  unregisterPartnerShell: (token: symbol) => void;
};

const PartnerShellFrameContext = createContext<PartnerShellFrameContextValue | null>(null);

export const PartnerShellFrameProvider = PartnerShellFrameContext.Provider;

/** Non-null only for routes rendered inside <PartnerShellFrame>. */
export function usePartnerShellFrame(): PartnerShellFrameContextValue | null {
  return useContext(PartnerShellFrameContext);
}

export const EMPTY_PARTNER_SHELL_REGISTRATION: PartnerShellRegistration = {};

const REGISTRATION_KEYS: ReadonlyArray<keyof PartnerShellRegistration> = [
  'restaurantName',
  'restaurantId',
  'sidebarPosition',
  'leftSidebarCollapsed',
  'mobileMenuExtra',
  'sidebarFilters',
  'hideHelpBadge',
  'headerTitle',
];

export function isSamePartnerShellRegistration(
  a: PartnerShellRegistration,
  b: PartnerShellRegistration
): boolean {
  return REGISTRATION_KEYS.every((key) => a[key] === b[key]);
}

/**
 * Layout effects keep the shell in sync before paint; the server has no layout phase.
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;
