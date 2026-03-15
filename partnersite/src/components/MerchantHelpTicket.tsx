"use client";

import { useState, useRef } from "react";
import { HelpCircle, X, Loader2, ImagePlus, Trash2 } from "lucide-react";
import { useMerchantSession } from "@/context/MerchantSessionContext";

const TITLE_LABELS: Record<string, string> = {
  MERCHANT_APP_TECHNICAL_ISSUE: "App / technical issue",
  VERIFICATION_ISSUE: "Verification / account verification",
  ACCOUNT_ISSUE: "Account issue",
  PAYOUT_DELAYED: "Payout delayed",
  PAYOUT_NOT_RECEIVED: "Payout not received",
  SETTLEMENT_DISPUTE: "Settlement dispute",
  COMMISSION_DISPUTE: "Commission dispute",
  MENU_UPDATE_ISSUE: "Menu / catalog update issue",
  STORE_STATUS_ISSUE: "Store status issue",
  MERCHANT_ORDER_NOT_RECEIVING: "Not receiving orders",
  OTHER: "Other",
  FEEDBACK: "Feedback",
  COMPLAINT: "Complaint",
  SUGGESTION: "Suggestion",
};

const TITLES_BY_CONTEXT: Record<string, string[]> = {
  auth: ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "ACCOUNT_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  register: ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "ACCOUNT_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  login: ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "ACCOUNT_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  "post-login": ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  "store-onboarding": ["MERCHANT_APP_TECHNICAL_ISSUE", "VERIFICATION_ISSUE", "MENU_UPDATE_ISSUE", "STORE_STATUS_ISSUE", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
  dashboard: ["MERCHANT_APP_TECHNICAL_ISSUE", "PAYOUT_DELAYED", "PAYOUT_NOT_RECEIVED", "SETTLEMENT_DISPUTE", "COMMISSION_DISPUTE", "MENU_UPDATE_ISSUE", "STORE_STATUS_ISSUE", "MERCHANT_ORDER_NOT_RECEIVING", "OTHER", "FEEDBACK", "COMPLAINT", "SUGGESTION"],
};

interface MerchantHelpTicketProps {
  pageContext: string;
  className?: string;
  /** When true, only the modal is used; no Help button is rendered (parent controls open state). */
  hideTrigger?: boolean;
  /** Controlled open state; use with onOpenChange when opening from e.g. sidebar. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export default function MerchantHelpTicket({ pageContext, className = "", hideTrigger = false, open: controlledOpen, onOpenChange }: MerchantHelpTicketProps) {
  const session = useMerchantSession();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined && onOpenChange !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = isControlled ? (v: boolean) => onOpenChange?.(v) : setInternalOpen;
  const [ticketTitle, setTicketTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // When modal is open, always render so the modal can show.
  // On login/register/auth pages, always show Help button so MX can raise concerns even before signing in.
  const isAuthPage = pageContext === "login" || pageContext === "register" || pageContext === "auth";
  if (!session?.isAuthenticated && !open && !isAuthPage) {
    return null;
  }

  // Show ticket form when user has session (API requires auth) or is in store-onboarding/register flow (may have partial session from Google).
  const showTicketForm = session?.isAuthenticated || pageContext === "store-onboarding" || pageContext === "register";

  const allowedTitles = TITLES_BY_CONTEXT[pageContext] || TITLES_BY_CONTEXT.auth;

  const uploadAttachment = async (file: File): Promise<string> => {
    const form = new FormData();
    form.set("file", file);
    const parent = `tickets/attachments/${Date.now()}`;
    form.set("parent", parent);
    form.set("filename", file.name.replace(/[^a-zA-Z0-9.-]/g, "_"));
    const res = await fetch("/api/upload/r2", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok || !data?.url) throw new Error(data?.error || "Upload failed");
    return data.url;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTitle || !subject.trim() || !description.trim()) {
      setMessage({ type: "error", text: "Please select a topic and fill subject and description." });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      let attachmentUrls: string[] = [];
      if (attachmentFiles.length > 0) {
        setUploadingAttachments(true);
        try {
          attachmentUrls = await Promise.all(attachmentFiles.map((f) => uploadAttachment(f)));
        } catch (err) {
          setMessage({ type: "error", text: "Failed to upload one or more images. Please try again." });
          setLoading(false);
          setUploadingAttachments(false);
          return;
        }
        setUploadingAttachments(false);
      }

      const res = await fetch("/api/merchant/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_title: ticketTitle,
          subject: subject.trim(),
          description: description.trim(),
          page_context: pageContext,
          ...(attachmentUrls.length ? { attachments: attachmentUrls } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to submit. Please try again." });
        setLoading(false);
        return;
      }
      setMessage({ type: "success", text: data.message || "Ticket raised successfully." });
      setTicketTitle("");
      setSubject("");
      setDescription("");
      setAttachmentFiles([]);
      setTimeout(() => {
        setOpen(false);
        setMessage(null);
      }, 2000);
    } catch {
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const valid = files.filter((f) => {
      if (!ALLOWED_TYPES.includes(f.type)) return false;
      if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) return false;
      return true;
    });
    setAttachmentFiles((prev) => [...prev, ...valid].slice(0, MAX_ATTACHMENTS));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachmentFiles((prev) => prev.filter((_: File, i: number) => i !== index));
  };

  return (
    <>
      {!hideTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${className}`}
          aria-label="Help / Raise ticket"
        >
          <HelpCircle className="h-4 w-4" />
          Help
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="help-ticket-title">
          <div className="absolute inset-0 z-[2200] bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="relative z-[2201] w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 id="help-ticket-title" className="text-lg font-bold text-slate-900">Need Help?</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {!showTicketForm ? (
              <>
                <p className="text-slate-600 mb-4">Please sign in to raise a support ticket.</p>
                <button type="button" onClick={() => setOpen(false)} className="w-full py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50">
                  Close
                </button>
              </>
            ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">What do you need help with? *</label>
                <select
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select</option>
                  {allowedTitles.map((t) => (
                    <option key={t} value={t}>
                      {TITLE_LABELS[t] || t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject *</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Brief summary"
                  maxLength={500}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your issue in detail..."
                  rows={4}
                  maxLength={5000}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Images (optional)</label>
                <p className="text-xs text-slate-500 mb-1">You can add up to {MAX_ATTACHMENTS} images (JPEG, PNG, GIF, WebP, max {MAX_FILE_SIZE_MB} MB each).</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  multiple
                  onChange={onFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={attachmentFiles.length >= MAX_ATTACHMENTS}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ImagePlus className="h-4 w-4" />
                  Add images
                </button>
                {attachmentFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {attachmentFiles.map((f, i) => (
                      <li key={i} className="flex items-center justify-between text-sm text-slate-600 bg-slate-50 rounded-lg px-2 py-1">
                        <span className="truncate flex-1">{f.name}</span>
                        <button type="button" onClick={() => removeAttachment(i)} className="p-1 text-red-600 hover:bg-red-50 rounded" aria-label="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {message && (
                <p className={`text-sm ${message.type === "success" ? "text-green-700" : "text-red-600"}`}>{message.text}</p>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || uploadingAttachments}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading || uploadingAttachments ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Submit"
                  )}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
