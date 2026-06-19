"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageCircle, X } from "lucide-react";
import {
  fetchPartnerChatCached,
  getCachedPartnerChat,
  type PartnerChatCacheEntry,
  type PartnerChatCacheMessage,
} from "@/lib/partnerChatCache";

export type PartnerChatMessage = PartnerChatCacheMessage;

function formatMessageTime(iso: string): string {
  if (!iso?.trim()) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function OrderPartnerChatSideSheet({
  orderCoreId,
  orderLabel,
  customerName,
  riderName,
  onClose,
}: {
  orderCoreId: number;
  orderLabel: string;
  customerName?: string | null;
  riderName?: string | null;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const cached = getCachedPartnerChat(orderCoreId);
  const [messages, setMessages] = useState<PartnerChatMessage[]>(cached?.messages ?? []);
  const [chatClosed, setChatClosed] = useState(cached?.chatClosed ?? false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hadCache = Boolean(getCachedPartnerChat(orderCoreId));
    void fetchPartnerChatCached(orderCoreId)
      .then((payload: PartnerChatCacheEntry) => {
        if (cancelled) return;
        setMessages(payload.messages);
        setChatClosed(payload.chatClosed);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        if (!hadCache) {
          setError(err instanceof Error ? err.message : "Failed to load chat");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [orderCoreId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: messages.length > 0 ? "smooth" : "auto" });
  }, [messages.length]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const headerSubtitle = orderLabel?.trim()
    ? `${orderLabel.trim()} · Live conversation on this order`
    : "Live conversation on this order";

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Order chat history"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-[#F3F4F6] shadow-2xl animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-tight text-slate-900">
                Order Chat History
              </h2>
              <p className="mt-1 truncate text-[11px] text-slate-500">{headerSubtitle}</p>
              {messages.length > 0 ? (
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {messages.length} message{messages.length === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
              aria-label="Close chat history"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
        >
          {error ? (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          ) : null}

          {messages.length === 0 && !error ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 px-6 text-center">
              <MessageCircle className="h-10 w-10 text-slate-300" strokeWidth={1.5} />
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                NO conversation history
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg) => {
                if (msg.senderType === "SYSTEM") {
                  return (
                    <div key={msg.id} className="flex justify-center px-2">
                      <div className="max-w-[92%] rounded-full bg-slate-200/90 px-3 py-1.5 text-center text-[11px] leading-snug text-slate-600">
                        {msg.body}
                      </div>
                    </div>
                  );
                }

                const isCustomer = msg.senderType === "CUSTOMER";
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isCustomer ? "items-start" : "items-end"}`}
                  >
                    <p
                      className={`mb-1 px-1 text-[10px] font-medium uppercase tracking-wide ${
                        isCustomer ? "text-slate-500" : "text-emerald-700"
                      }`}
                    >
                      {isCustomer
                        ? `User - ${customerName?.trim() || "Customer"}`
                        : `Partner - ${riderName?.trim() || "Delivery partner"}`}
                    </p>
                    <div
                      className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                        isCustomer
                          ? "rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200/80"
                          : "rounded-br-md bg-emerald-600 text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                        {msg.body}
                      </p>
                    </div>
                    <p
                      className={`mt-1 px-1 text-[10px] text-slate-400 ${
                        isCustomer ? "text-left" : "text-right"
                      }`}
                    >
                      {formatMessageTime(msg.createdAt)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {chatClosed ? (
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-2.5 text-center text-[11px] text-slate-500">
            Chat closed for this order.
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
