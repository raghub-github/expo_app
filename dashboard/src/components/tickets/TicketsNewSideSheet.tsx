"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";
import { X, Ticket, Mail, UserPlus, Building2 } from "lucide-react";
import { NewTicketForm } from "./NewTicketForm";
import { ComposeEmailForm } from "./ComposeEmailForm";
import { NewContactForm } from "./NewContactForm";
import { NewCompanyForm } from "./NewCompanyForm";

export type TicketsNewSheetType = "ticket" | "email" | "contact" | "company";

const SHEET_META: Record<
  TicketsNewSheetType,
  { title: string; subtitle: string; icon: LucideIcon; iconClass: string }
> = {
  ticket: {
    title: "Create new ticket",
    subtitle: "Add a support ticket for a customer, rider, or merchant.",
    icon: Ticket,
    iconClass: "bg-[#121212] text-white",
  },
  email: {
    title: "Compose email",
    subtitle: "Send an email to a contact or customer.",
    icon: Mail,
    iconClass: "bg-blue-100 text-blue-700",
  },
  contact: {
    title: "New contact",
    subtitle: "Add a contact for support or CRM.",
    icon: UserPlus,
    iconClass: "bg-emerald-100 text-emerald-700",
  },
  company: {
    title: "New company",
    subtitle: "Add a company for support or CRM.",
    icon: Building2,
    iconClass: "bg-violet-100 text-violet-700",
  },
};

interface TicketsNewSideSheetProps {
  type: TicketsNewSheetType | null;
  onClose: () => void;
}

export function TicketsNewSideSheet({ type, onClose }: TicketsNewSideSheetProps) {
  const open = type != null;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !type || typeof document === "undefined") return null;

  const meta = SHEET_META[type];
  const Icon = meta.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.iconClass}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[#121212]">{meta.title}</h2>
                <p className="mt-0.5 text-[11px] text-[#121212]/55">{meta.subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {type === "ticket" && <NewTicketForm variant="sidesheet" onClose={onClose} />}
          {type === "email" && <ComposeEmailForm variant="sidesheet" onClose={onClose} />}
          {type === "contact" && <NewContactForm variant="sidesheet" onClose={onClose} />}
          {type === "company" && <NewCompanyForm variant="sidesheet" onClose={onClose} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
