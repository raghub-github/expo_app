'use client';

import React from 'react';
import { Toaster } from 'sonner';

export function GlobalToaster() {
  return (
    <Toaster
      position="top-right"
      richColors
      toastOptions={{
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

