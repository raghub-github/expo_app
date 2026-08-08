'use client';

import React from 'react';
import { Toaster } from 'sonner';
import { PARTNER_AUTH_TOAST_MS } from '@/lib/auth/partner-auth-toast';

export function GlobalToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      duration={PARTNER_AUTH_TOAST_MS}
      toastOptions={{
        duration: PARTNER_AUTH_TOAST_MS,
        classNames: {
          toast: 'mx-toast',
          title: 'mx-toast__title',
          description: 'mx-toast__desc',
          actionButton: 'mx-toast__action',
          cancelButton: 'mx-toast__cancel',
        },
      }}
    />
  );
}

