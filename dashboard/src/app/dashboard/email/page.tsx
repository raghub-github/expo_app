"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Send, Paperclip } from "lucide-react";

export default function ComposeEmailPage() {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = () => {
    setSending(true);
    // In a full implementation this would call an API or open mailto.
    // For now we simulate success and show feedback.
    setTimeout(() => {
      setSending(false);
      setSent(true);
    }, 800);
  };

  const handleMailto = () => {
    const params = new URLSearchParams();
    if (subject) params.set("subject", subject);
    if (body) params.set("body", body);
    const mailto = `mailto:${to || ""}?${params.toString()}`;
    window.location.href = mailto;
  };

  if (sent) {
    return (
      <div className="min-h-full bg-gray-50/80 p-4 sm:p-6">
        <div className="mx-auto max-w-xl">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 mb-4">
              <Mail className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">Email ready</h2>
            <p className="mt-2 text-sm text-gray-600">
              Use your default mail client to send, or integrate an email API for in-app sending.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleMailto}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                Open in mail client
              </button>
              <Link
                href="/dashboard/email"
                onClick={() => setSent(false)}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Compose another
              </Link>
              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50/80 p-4 sm:p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                <Mail className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Compose email</h1>
                <p className="text-sm text-gray-600 mt-0.5">Send an email to a contact or customer.</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
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
                rows={10}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !to.trim()}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send
                  </>
                )}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <Paperclip className="h-4 w-4" />
                Attach
              </button>
              <Link
                href="/dashboard"
                className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
