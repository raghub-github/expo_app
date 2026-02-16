"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import type { TicketMessage } from "@/hooks/tickets/useTicketDetail";
import { getTicketAttachmentViewUrl } from "@/lib/ticket-attachment-url";

const SEND_STATUS_OPTIONS = [
  { value: "no_change", label: "Send without status change" },
  { value: "pending", label: "Send and set as Pending" },
  { value: "resolved", label: "Send and set as Resolved" },
  { value: "closed", label: "Send and set as Closed" },
  { value: "waiting_for_user", label: "Send and set as Waiting for User" },
  { value: "provisionally_resolved", label: "Send and set as Provisionally Resolved" },
] as const;

function formatMessageTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleString();
}

function senderLabel(senderType: string): string {
  const m: Record<string, string> = {
    agent: "Agent",
    customer: "Customer",
    rider: "Rider",
    merchant: "Merchant",
    system: "System",
  };
  return m[senderType?.toLowerCase()] ?? senderType ?? "Unknown";
}

function initial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

interface ConversationPanelProps {
  ticketId: number;
  messages: TicketMessage[];
}

export function ConversationPanel({ ticketId, messages }: ConversationPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const sendOptionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sendOptionsRef.current && !sendOptionsRef.current.contains(e.target as Node)) {
        setSendOptionsOpen(false);
      }
    }
    if (sendOptionsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [sendOptionsOpen]);

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500">No messages yet.</p>
        ) : (
          messages.map((msg) => {
            const isPrivate = (msg.messageType || "").toLowerCase() === "internal_note";
            return (
              <div
                key={msg.id}
                className={`flex gap-3 rounded-lg p-3 ${
                  isPrivate ? "bg-amber-50/80 border border-amber-100" : "bg-gray-50/50"
                }`}
              >
                <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                  {initial(senderLabel(msg.senderType))}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-900">{senderLabel(msg.senderType)}</span>
                    {isPrivate && (
                      <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-xs font-medium text-amber-900">
                        Private note
                      </span>
                    )}
                    <span className="text-gray-500">{formatMessageTime(msg.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap break-words">
                    {msg.message}
                  </div>
                  {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {msg.attachments.map((a: { name?: string; url?: string }, i: number) => {
                        const rawUrl = typeof a === "string" ? a : a?.url;
                        const viewUrl = getTicketAttachmentViewUrl(rawUrl) || "#";
                        const name = typeof a === "object" && a?.name ? a.name : "Attachment";
                        const isImage = !!(rawUrl && /\.(jpe?g|png|gif|webp)$/i.test(rawUrl));
                        return (
                          <span key={i} className="inline-flex flex-col gap-1">
                            {isImage ? (
                              <a
                                href={viewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                <img
                                  src={viewUrl}
                                  alt={name}
                                  className="max-h-24 rounded border border-gray-200 object-contain bg-gray-50"
                                  onError={(e) => {
                                    const img = e.target as HTMLImageElement;
                                    img.parentElement!.style.display = "none";
                                    const textLink = img.parentElement?.nextElementSibling as HTMLElement;
                                    if (textLink) textLink.style.display = "inline";
                                  }}
                                />
                              </a>
                            ) : null}
                            <a
                              href={viewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                              style={isImage ? { display: "none" } : undefined}
                            >
                              {name}
                            </a>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply editor */}
      <div id="reply" className="border-t border-gray-200 p-4">
        <label htmlFor="reply-message" className="sr-only">
          Reply
        </label>
        <textarea
          id="reply-message"
          rows={3}
          placeholder="Type your reply... (Markdown supported)"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="text-xs text-gray-500">Saved</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Send
            </button>
            {/* Send & set status with dropdown for extra options */}
            <div className="relative" ref={sendOptionsRef}>
              <div className="flex rounded-lg border border-gray-300 bg-white overflow-hidden">
                <button
                  type="button"
                  className="rounded-l-lg border-r border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Send & set status
                </button>
                <button
                  type="button"
                  onClick={() => setSendOptionsOpen((v) => !v)}
                  className="rounded-r-lg px-2 py-1.5 text-gray-600 hover:bg-gray-50 border-0"
                  aria-label="Send options"
                  aria-expanded={sendOptionsOpen}
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${sendOptionsOpen ? "rotate-180" : ""}`} />
                </button>
              </div>
              {sendOptionsOpen && (
                <div className="absolute right-0 bottom-full z-20 mb-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <p className="px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Send & set status</p>
                  {SEND_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setSendOptionsOpen(false)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
