"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type ToastVariant = "success" | "error" | "info";
type ToastItem = { id: number; message: string; variant: ToastVariant };

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

function ToastViewport({ items }: { items: ToastItem[] }) {
  return (
    <div
      className="fixed top-16 right-4 flex flex-col gap-1.5 pointer-events-none"
      style={{ zIndex: 2147483646, isolation: "isolate" }}
      aria-live="polite"
    >
      {items.map((item) => (
        <div
          key={item.id}
          className={`pointer-events-auto rounded-md border px-3 py-2 shadow-md text-xs font-medium ${
            item.variant === "error"
              ? "border-red-500 bg-red-50 text-red-800"
              : item.variant === "info"
                ? "border-slate-400 bg-white text-slate-800"
                : "border-emerald-500 bg-emerald-50 text-emerald-800"
          }`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const idRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

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
      {mounted && typeof document !== "undefined"
        ? createPortal(<ToastViewport items={items} />, document.body)
        : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) return { toast: (_message: string, _variant?: ToastVariant) => {} };
  return ctx;
}
