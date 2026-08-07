"use client";

import { useState } from "react";
import { Send, Paperclip } from "lucide-react";

interface ComposeEmailFormProps {
  variant?: "page" | "sidesheet";
  onClose?: () => void;
}

export function ComposeEmailForm({ variant = "page", onClose }: ComposeEmailFormProps) {
  const isSideSheet = variant === "sidesheet";
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = () => {
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      const params = new URLSearchParams();
      if (subject) params.set("subject", subject);
      if (body) params.set("body", body);
      window.location.href = `mailto:${to || ""}?${params.toString()}`;
      onClose?.();
    }, 400);
  };

  return (
    <div className={isSideSheet ? "space-y-4" : "p-6 space-y-4"}>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">To *</label>
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">CC</label>
          <input
            type="text"
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">BCC</label>
          <input
            type="text"
            value={bcc}
            onChange={(e) => setBcc(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message..."
          rows={8}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
        />
      </div>
      <div className={`flex flex-wrap items-center gap-3 ${isSideSheet ? "pt-1" : "pt-2 border-t border-gray-200"}`}>
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !to.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#121212] px-4 py-2 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
        >
          {sending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {sending ? "Opening…" : "Send"}
        </button>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Paperclip className="h-4 w-4" />
          Attach
        </button>
        {isSideSheet ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </div>
  );
}
