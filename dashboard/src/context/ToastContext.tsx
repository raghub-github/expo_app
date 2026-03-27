"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastVariant = "success" | "error";
type ToastItem = { id: number; message: string; variant: ToastVariant };

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, variant: ToastVariant = "success") => {
    const id = ++idRef.current;
    setItems((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed top-16 right-4 z-[9999] flex flex-col gap-1.5 pointer-events-none"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-md border px-3 py-2 shadow-md text-xs font-medium ${
              item.variant === "error"
                ? "border-red-500 bg-red-50 text-red-800"
                : "border-emerald-500 bg-emerald-50 text-emerald-800"
            }`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: (_message: string, _variant?: ToastVariant) => {} };
  return ctx;
}
