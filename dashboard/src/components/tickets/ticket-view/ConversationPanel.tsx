"use client";

import { useState, useRef, useEffect, useCallback, type ClipboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Globe,
  Mail,
  Lock,
  Reply,
  StickyNote,
  Forward,
  PenLine,
  X,
  Maximize2,
  Paperclip,
  Star,
  BookOpen,
  Trash2,
  Send,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  Link,
  Image,
  Table,
  Code,
  Download,
  Eraser,
  Undo2,
  Redo2,
  MoreHorizontal,
  Check,
} from "lucide-react";
import { ticketMessageFromPostApi, type TicketMessage, type TicketMessageSentPayload } from "@/hooks/tickets/useTicketDetail";
import { useTicketComposeAutomationQuery } from "@/hooks/tickets/useTicketComposeAutomationQuery";
import { useSignedAttachmentUrl } from "@/hooks/tickets/useSignedAttachmentUrl";
import { isImageUrl } from "./AttachmentModal";
import { useAuth } from "@/providers/AuthProvider";
import { useToast } from "@/context/ToastContext";
const SEND_STATUS_OPTIONS = [
  { value: "no_change", label: "Send without status change" },
  { value: "PENDING", label: "Send and set as Pending" },
  { value: "RESOLVED", label: "Send and set as Resolved" },
  { value: "CLOSED", label: "Send and set as Closed" },
  { value: "WAITING_FOR_USER", label: "Send and set as Waiting for User" },
  { value: "PROVISIONALLY_RESOLVED", label: "Send and set as Provisionally Resolved" },
] as const;

const CONVERSATION_FIRST = 10;
const CONVERSATION_LAST = 5;
const CONVERSATION_EXPAND_STEP = 10;

const QUICK_REPLY_TEMPLATES = [
  "Thank you for contacting us. We will get back to you shortly.",
  "We have received your request and are looking into it.",
  "Could you please provide more details?",
  "This has been resolved. Let us know if you need anything else.",
];

const KNOWLEDGE_BASE_SNIPPETS = [
  "Typical resolution time for requests like yours is 24–48 business hours. We will update you as soon as we have progress.",
  "To help us resolve this faster, please share your order ID and, if possible, a screenshot of the invoice or the issue you are seeing.",
  "You can check live order status anytime in the GatiMitra app under Orders → Active.",
  "If the issue continues after these steps, we will escalate to our logistics partner and follow up within one business day.",
];

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

function formatMessageTimeLong(createdAt: string): string {
  const date = new Date(createdAt);
  const relative = formatMessageTime(createdAt);
  const absolute = date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${relative} (${absolute})`;
}

function senderDisplayName(msg: TicketMessage): string {
  if (msg.senderEmail) return msg.senderEmail;
  if (msg.senderName) return msg.senderName;
  const m: Record<string, string> = {
    agent: "Agent",
    customer: "Customer",
    rider: "Rider",
    merchant: "Merchant",
    system: "System",
  };
  return m[msg.senderType?.toLowerCase()] ?? msg.senderType ?? "Unknown";
}

function initial(name: string): string {
  return (name || "?").charAt(0).toUpperCase();
}

function avatarBgClass(senderType: string, isPrivate: boolean): string {
  if (isPrivate) return "bg-amber-100 text-amber-800";
  const t = senderType?.toLowerCase();
  if (t === "agent" || t === "system") return "bg-orange-100 text-orange-800";
  return "bg-gray-200 text-gray-700";
}

function isImageAttachment(attachment: { name?: string; mimeType?: string }): boolean {
  const mime = (attachment.mimeType ?? "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = (attachment.name ?? "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|bmp|svg)(\?.*)?$/i.test(name);
}

function MessageAttachment({
  attachment,
  downloadNamePrefix,
}: {
  attachment: { url?: string; storageKey?: string; name?: string; mimeType?: string };
  downloadNamePrefix: string;
}) {
  const storageKey = attachment.storageKey ?? null;
  const { url: signedUrl, error } = useSignedAttachmentUrl(storageKey);
  const url = attachment.url || signedUrl || (error ? undefined : "");
  const name = attachment.name || "Attachment";
  const isImage = isImageAttachment(attachment) || (!!url && isImageUrl(url));
  const handleDownloadAttachment = async (downloadUrl: string, fileName?: string) => {
    if (!downloadUrl || downloadUrl === "#") return;
    try {
      const extFromName =
        fileName && fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
      const extFromUrl = !extFromName
        ? (() => {
            try {
              const clean = downloadUrl.split("?")[0].split("#")[0];
              const p = clean.split(".").pop();
              return p ? `.${p}` : "";
            } catch {
              return "";
            }
          })()
        : "";
      const finalName = `${downloadNamePrefix}${extFromName || extFromUrl}`;
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = finalName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    }
  };

  if (storageKey && !url && !error) return <span className="text-xs text-gray-400">Loading…</span>;
  if (!url && error) return <span className="text-xs text-gray-500">{name} (unavailable)</span>;

  if (isImage && url) {
    return (
      <>
        <div className="relative inline-flex min-w-[150px] max-w-[170px] items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 pr-8 text-left shadow-sm">
          <button
            type="button"
            onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
            className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100">
              <img src={url} alt="" className="h-full w-full object-cover" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-gray-700">{name}</span>
              <span className="block text-[10px] text-gray-500">Image attachment</span>
            </span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleDownloadAttachment(url, name || undefined);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex cursor-pointer items-center justify-center text-gray-500 hover:text-gray-700"
            aria-label="Download attachment"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative inline-flex min-w-[150px] max-w-[170px] items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 pr-8 text-left shadow-sm">
        <button
          type="button"
          onClick={() => {
            if (!url) return;
            window.open(url, "_blank", "noopener,noreferrer");
          }}
          className="inline-flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100">
            <Paperclip className="h-3.5 w-3.5 text-gray-500" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold text-gray-700">{name}</span>
            <span className="block text-[10px] text-gray-500">File attachment</span>
          </span>
        </button>
        {url && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleDownloadAttachment(url, name || undefined);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex cursor-pointer items-center justify-center text-gray-500 hover:text-gray-700"
            aria-label="Download attachment"
            title="Download"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </>
  );
}

/** True if message is from the agent (our response); false if from rider, customer, or merchant. */
function isAgentMessage(msg: TicketMessage): boolean {
  const t = (msg.senderType ?? "").toUpperCase();
  return t === "AGENT";
}

function MessageBlock({
  msg,
  recipientEmail,
  senderDisplayName,
  formatMessageTimeLong,
  initial,
  avatarBgClass,
  currentUserEmail,
  downloadNamePrefix,
  onEditRequest,
  onDeleteRequest,
  showBottomActions,
  onReplyAction,
  onAddNoteAction,
  onForwardAction,
}: {
  msg: TicketMessage;
  recipientEmail: string | null;
  senderDisplayName: (m: TicketMessage) => string;
  formatMessageTimeLong: (s: string) => string;
  initial: (s: string) => string;
  avatarBgClass: (t: string, p: boolean) => string;
  currentUserEmail: string | null;
  downloadNamePrefix: string;
  onEditRequest: (message: TicketMessage) => void;
  onDeleteRequest: (message: TicketMessage) => void;
  showBottomActions: boolean;
  onReplyAction: () => void;
  onAddNoteAction: (visibility: "private" | "public") => void;
  onForwardAction: () => void;
}) {
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const noteMenuRef = useRef<HTMLDivElement>(null);
  const [selectedNoteVisibility, setSelectedNoteVisibility] = useState<"private" | "public">("private");
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      const target = e.target as Node;
      if (!(noteMenuRef.current?.contains(target))) {
        setNoteMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);
  const normalizedMessageType = String(msg.messageType || "").toLowerCase();
  const isPrivate =
    Boolean(msg.isInternalNote) ||
    normalizedMessageType === "internal_note";
  const isPublicNote =
    !isPrivate &&
    (normalizedMessageType === "public_note" || normalizedMessageType === "note_public");
  const displayName = senderDisplayName(msg);
  const hasAgentType = isAgentMessage(msg);
  const senderTypeEmpty = !(msg.senderType ?? "").trim();
  const sameAsLoggedIn = Boolean(
    currentUserEmail && msg.senderEmail && String(currentUserEmail).trim() === String(msg.senderEmail).trim()
  );
  const fromAgent = hasAgentType || (senderTypeEmpty && sameAsLoggedIn);
  const isEmailMessage = /email/i.test(String(msg.messageType ?? ""));
  const senderTypeLabel = (() => {
    const t = String(msg.senderType ?? "").toUpperCase();
    if (t === "MERCHANT") return "Merchant";
    if (t === "RIDER") return "Rider";
    if (t === "CUSTOMER") return "Customer";
    return "Participant";
  })();
  const participantSourceLabel = /app/i.test(String(msg.messageType ?? ""))
    ? "reported via the App"
    : "reported via the portal";
  const isOwnMessage = Boolean(
    currentUserEmail && msg.senderEmail && String(currentUserEmail).trim() === String(msg.senderEmail).trim()
  );
  const canModifyWithinWindow = (() => {
    const createdMs = new Date(msg.createdAt).getTime();
    if (!Number.isFinite(createdMs)) return false;
    return Date.now() - createdMs <= 5 * 60 * 1000;
  })();
  const canEditDelete = isOwnMessage && canModifyWithinWindow;
  const showAgentActions = fromAgent;
  const cardBg = isPrivate
    ? "bg-[#f7f1e7] border-[#eadfcd]"
    : fromAgent
      ? "bg-[#f4f7fa] border-[#e3e8ee]"
      : "bg-white border-transparent shadow-none";
  const disabledHint = "Edit/Delete allowed only within 5 minutes";
  const messageHasHtml = /<\/?[a-z][\s\S]*>/i.test(String(msg.message ?? ""));
  return (
    <div className="flex w-full flex-col justify-start">
      <div className={`group flex w-full gap-3 rounded-lg border px-3.5 py-3 ${fromAgent || isPrivate ? "shadow-[0_1px_0_rgba(15,23,42,0.03)]" : ""} ${cardBg}`}>
        <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarBgClass(msg.senderType, isPrivate)}`}>
          {initial(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 text-[13px] leading-5">
              {fromAgent ? (
                <>
                  <div>
                    {isPrivate || isPublicNote ? (
                      <>
                        <span className="font-semibold text-blue-700">GatiMitra Team</span>
                        <span className="text-gray-700"> - Replied - </span>
                        <span className="text-gray-700">({msg.senderEmail || displayName})</span>
                        <span className="text-gray-700">
                          {isPrivate ? " added a private note" : " added a public note"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-blue-700">GatiMitra Team</span>
                        <span className="text-gray-700"> - Replied - </span>
                        <span className="text-gray-700">({msg.senderEmail || displayName})</span>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span className="font-semibold text-blue-700">{senderTypeLabel}</span>
                    <span className="text-gray-700"> - Response - </span>
                    <span className="text-gray-700">({displayName})</span>
                  </div>
                  <div className="text-gray-700">{participantSourceLabel}</div>
                </>
              )}
            </div>
            {showAgentActions && (
              <div className="msg-actions flex shrink-0 items-center gap-1.5 opacity-0 invisible pointer-events-none transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:visible group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
                <button
                  type="button"
                  className={`inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-gray-300 bg-white shadow-sm ${
                    canEditDelete ? "cursor-pointer text-gray-600 hover:bg-gray-50" : "cursor-not-allowed text-gray-300 opacity-70"
                  }`}
                  aria-label="Edit message"
                  disabled={!canEditDelete}
                  onClick={() => canEditDelete && onEditRequest(msg)}
                  title={canEditDelete ? "Edit message" : disabledHint}
                >
                  <PenLine className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className={`inline-flex h-6.5 w-6.5 items-center justify-center rounded-md border border-gray-300 bg-white shadow-sm ${
                    canEditDelete ? "cursor-pointer text-red-500 hover:bg-red-50" : "cursor-not-allowed text-gray-300 opacity-70"
                  }`}
                  aria-label="Delete"
                  disabled={!canEditDelete}
                  onClick={() => canEditDelete && onDeleteRequest(msg)}
                  title={canEditDelete ? "Delete message" : disabledHint}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
          <div className="mt-1 text-[11px] italic text-gray-500">
            {formatMessageTimeLong(msg.createdAt)}
          </div>
          {fromAgent && !isPrivate && !isPublicNote && (msg.emailRecipientTo || msg.emailRecipientCc || msg.emailRecipientBcc) && (
            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-l-2 border-violet-200 pl-2.5 text-[12px] leading-snug text-gray-700">
              {msg.emailRecipientTo ? (
                <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5">
                  <span className="shrink-0 font-medium text-gray-600">To</span>
                  <span className="min-w-0 break-all">{msg.emailRecipientTo}</span>
                </span>
              ) : null}
              {msg.emailRecipientCc ? (
                <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5">
                  <span className="shrink-0 font-medium text-gray-600">Cc</span>
                  <span className="min-w-0 break-all">{msg.emailRecipientCc}</span>
                </span>
              ) : null}
              {msg.emailRecipientBcc ? (
                <span className="inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1.5">
                  <span className="shrink-0 font-medium text-gray-600">Bcc</span>
                  <span className="min-w-0 break-all">{msg.emailRecipientBcc}</span>
                </span>
              ) : null}
            </div>
          )}
          {!isPrivate && isEmailMessage && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#1f2937]">
              <Mail className="h-3 w-3 shrink-0" />
              <span>To: {recipientEmail || "—"}</span>
            </div>
          )}
          {messageHasHtml ? (
            <div
              className="mt-2 max-w-[920px] break-words text-[13px] leading-7 text-[#1f2937]"
              dangerouslySetInnerHTML={{ __html: String(msg.message) }}
            />
          ) : (
            <div className="mt-2 max-w-[920px] whitespace-pre-wrap break-words text-[13px] leading-7 text-[#1f2937]">
              {msg.message}
            </div>
          )}
          {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {msg.attachments.map((a: { name?: string; url?: string; storageKey?: string; mimeType?: string }, i: number) => (
                <MessageAttachment key={i} attachment={a} downloadNamePrefix={downloadNamePrefix} />
              ))}
            </div>
          )}
        </div>
      </div>
      {showBottomActions && fromAgent && (
        <div className="mt-2 flex items-center gap-2 pl-1">
          <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarBgClass(msg.senderType, false)}`}>
            {initial(displayName)}
          </div>
          <button
            type="button"
            onClick={onReplyAction}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </button>
          <button
            type="button"
            onClick={() => {
              onAddNoteAction(selectedNoteVisibility);
              setNoteMenuOpen(false);
            }}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <StickyNote className="h-3.5 w-3.5" />
            Add note
          </button>
          <div className="relative" ref={noteMenuRef}>
            <button
              type="button"
              onClick={() => setNoteMenuOpen((v) => !v)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              aria-label="Select note visibility"
              title="Select note visibility"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {noteMenuOpen && (
              <div className="absolute bottom-[calc(100%+4px)] left-0 z-20 w-52 rounded-md border border-gray-200 bg-white p-1.5 shadow-[0_6px_24px_rgba(15,23,42,0.12)]">
                <p className="px-2 pb-1 text-[12px] font-medium text-gray-500">Mark note as</p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNoteVisibility("public");
                    setNoteMenuOpen(false);
                  }}
                  className={`flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left ${
                    selectedNoteVisibility === "public" ? "bg-[#eaf3ff] text-[#1d4ed8]" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="block text-[12px] font-medium leading-4">Public</span>
                      <span className="mt-0.5 block text-[11px] leading-3.5 text-gray-500">Visible to contact</span>
                    </span>
                  </span>
                  {selectedNoteVisibility === "public" ? <Check className="mt-0.5 h-3.5 w-3.5" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNoteVisibility("private");
                    setNoteMenuOpen(false);
                  }}
                  className={`mt-1 flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left ${
                    selectedNoteVisibility === "private" ? "bg-[#eaf3ff] text-[#1d4ed8]" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <span className="flex items-start gap-2">
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="block text-[12px] font-medium leading-4">Private</span>
                      <span className="mt-0.5 block text-[11px] leading-3.5 text-gray-500">Private</span>
                    </span>
                  </span>
                  {selectedNoteVisibility === "private" ? <Check className="mt-0.5 h-3.5 w-3.5" /> : null}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onForwardAction}
            className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50"
          >
            <Forward className="h-3.5 w-3.5" />
            Forward
          </button>
        </div>
      )}
    </div>
  );
}

interface ConversationPanelProps {
  ticketId: number;
  ticketNumber?: string | number | null;
  /** Ticket subject / title line (for toolbar forward template). */
  ticketSubject?: string | null;
  messages: TicketMessage[];
  /** Email of the user who raised the ticket (for "To:" in each reply block). */
  recipientEmail?: string | null;
  onMessageSent?: (payload?: TicketMessageSentPayload) => void;
  /** When false, reply editor is hidden; shown when user clicks Reply in action bar. */
  replyVisible?: boolean;
  /** Callback to close/collapse the reply section. */
  onCloseReply?: () => void;
  /** Callback to open/expand reply composer. */
  onOpenReply?: () => void;
  /** Trigger composer mode from top action bar. */
  quickComposeAction?: { type: "reply" | "forward" | "note_private" | "note_public"; nonce: number } | null;
  /** When true, do not add a separate scrollbar; content flows with the page. */
  noScroll?: boolean;
  /** When true, render as part of parent surface (no outer card border/background). */
  embedded?: boolean;
}

/** Sender display name and email from session (Supabase) — no hardcoded data. */
function useSenderFromSession(): { senderName: string; senderEmail: string; fromLetter: string } {
  const { user: authUser } = useAuth();
  const user = authUser;
  const email = (user?.email ?? "") || "";
  const meta = (user as { user_metadata?: { full_name?: string; name?: string } })?.user_metadata;
  const name =
    (meta?.full_name && String(meta.full_name).trim()) ||
    (meta?.name && String(meta.name).trim()) ||
    (email ? email.split("@")[0] : "") ||
    "Care";
  const letter = (name || "C").charAt(0).toUpperCase();
  return { senderName: name, senderEmail: email, fromLetter: letter };
}

export function ConversationPanel({
  ticketId,
  ticketNumber = null,
  ticketSubject = null,
  messages,
  recipientEmail = null,
  onMessageSent,
  replyVisible = false,
  onCloseReply,
  onOpenReply,
  quickComposeAction = null,
  noScroll = false,
  embedded = false,
}: ConversationPanelProps) {
  const downloadNamePrefix = `Gmitra_Tkt#${ticketNumber ?? ticketId}`;
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const sendOptionsRef = useRef<HTMLDivElement>(null);
  const sendDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const sendDropdownContentRef = useRef<HTMLDivElement>(null);
  const [sendDropdownPosition, setSendDropdownPosition] = useState<{ bottom: number; left: number } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [composeAsInternalNote, setComposeAsInternalNote] = useState(false);
  const [noteVisibility, setNoteVisibility] = useState<"private" | "public">("private");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [composeMode, setComposeMode] = useState<"reply" | "forward">("reply");
  const [toRecipientsInput, setToRecipientsInput] = useState("");
  const [ccRecipientsInput, setCcRecipientsInput] = useState("");
  const [bccRecipientsInput, setBccRecipientsInput] = useState("");
  const { data: composeAuto, isSuccess: composeAutoReady, isError: composeAutoError } = useTicketComposeAutomationQuery();
  const [showToInput, setShowToInput] = useState(false);
  const [showCcInput, setShowCcInput] = useState(false);
  const [showBccInput, setShowBccInput] = useState(false);
  const [editTarget, setEditTarget] = useState<TicketMessage | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TicketMessage | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [expandedMiddleCount, setExpandedMiddleCount] = useState(0);
  const { senderName, senderEmail, fromLetter } = useSenderFromSession();
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1]?.id ?? null : null;

  useEffect(() => {
    if (composeAsInternalNote) {
      setToRecipientsInput("");
      return;
    }
    if (composeMode === "forward") {
      setToRecipientsInput("");
      return;
    }
  }, [composeAsInternalNote, composeMode]);

  useEffect(() => {
    if (!replyVisible || composeAsInternalNote) return;
    if (composeMode === "forward") return;
    if (!composeAutoReady && !composeAutoError) return;
    if (composeAuto) {
      const ccRaw = composeAuto.defaultCc;
      setCcRecipientsInput(ccRaw);
      setShowCcInput(Boolean(ccRaw.trim()));
      const t = composeAuto.defaultTo.trim();
      setToRecipientsInput(composeAuto.defaultTo);
      setShowToInput(Boolean(t));
      const b = composeAuto.defaultBcc.trim();
      setBccRecipientsInput(composeAuto.defaultBcc);
      setShowBccInput(Boolean(b));
    } else if (composeAutoError) {
      setCcRecipientsInput("");
      setShowCcInput(false);
      setToRecipientsInput("");
      setShowToInput(false);
      setBccRecipientsInput("");
      setShowBccInput(false);
    }
  }, [replyVisible, composeAuto, composeAsInternalNote, composeMode, composeAutoReady, composeAutoError]);

  const total = messages.length;
  const maxMiddle = Math.max(0, total - CONVERSATION_FIRST - CONVERSATION_LAST);
  const useCollapse = total > CONVERSATION_FIRST + CONVERSATION_LAST;
  const topMessages = useCollapse ? messages.slice(0, CONVERSATION_FIRST) : messages;
  const bottomMessages = useCollapse ? messages.slice(-CONVERSATION_LAST) : [];
  const effectiveExpanded = Math.min(expandedMiddleCount, maxMiddle);
  const hiddenCount = useCollapse ? Math.max(0, maxMiddle - effectiveExpanded) : 0;
  const middleMessages = useCollapse ? messages.slice(CONVERSATION_FIRST, CONVERSATION_FIRST + effectiveExpanded) : [];
  const hasMoreToExpand = hiddenCount > 0;
  const showExpandBadge = useCollapse && (hasMoreToExpand || effectiveExpanded > 0);

  // On load/refresh keep user at first conversation (top of messages)
  useEffect(() => {
    conversationScrollRef.current?.scrollTo(0, 0);
  }, [ticketId]);

  // Scroll reply into view only when user opens it (replyVisible becomes true)
  const didScrollToReply = useRef(false);
  useEffect(() => {
    if (replyVisible) {
      didScrollToReply.current = true;
      requestAnimationFrame(() => {
        document.getElementById("reply")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } else {
      didScrollToReply.current = false;
    }
  }, [replyVisible]);

  const openSendOptions = useCallback(() => {
    const el = sendDropdownTriggerRef.current;
    if (el && typeof window !== "undefined") {
      const rect = el.getBoundingClientRect();
      setSendDropdownPosition({ bottom: window.innerHeight - rect.top + 8, left: rect.left });
      setSendOptionsOpen(true);
    } else {
      setSendOptionsOpen(true);
      setSendDropdownPosition(null);
    }
  }, []);

  const replyBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const hasComposerDraft = replyText.trim().length > 0 || attachedFiles.length > 0;
  const [templatePicker, setTemplatePicker] = useState<null | "quick" | "kb">(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showNoteTypeMenu, setShowNoteTypeMenu] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);
  const templatesTriggerRef = useRef<HTMLDivElement>(null);
  const noteTypeMenuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const handledQuickActionRef = useRef<number | null>(null);

  const sanitizeMessageHtml = useCallback((rawHtml: string) => {
    if (typeof window === "undefined") return rawHtml;
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, "text/html");
    doc.querySelectorAll("script,style,iframe,object,embed").forEach((n) => n.remove());
    doc.querySelectorAll("*").forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        const n = attr.name.toLowerCase();
        const v = String(attr.value ?? "");
        if (n.startsWith("on")) el.removeAttribute(attr.name);
        if ((n === "href" || n === "src") && /^javascript:/i.test(v.trim())) el.removeAttribute(attr.name);
      });
    });
    return (doc.body.innerHTML || "").trim();
  }, []);

  const openComposerAndFocus = useCallback(() => {
    onOpenReply?.();
    requestAnimationFrame(() => {
      document.getElementById("reply")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      requestAnimationFrame(() => {
        replyBodyRef.current?.focus();
      });
    });
  }, [onOpenReply]);

  const insertAtEnd = useCallback((text: string) => {
    const el = replyBodyRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand("insertText", false, text);
    setReplyText(el.innerText);
  }, []);

  const handleQuickReply = useCallback(() => {
    setComposeMode("reply");
    setComposeAsInternalNote(false);
    setNoteVisibility("private");
    openComposerAndFocus();
  }, [openComposerAndFocus]);

  const handleQuickAddNote = useCallback((visibility: "private" | "public") => {
    setComposeMode("reply");
    setComposeAsInternalNote(visibility === "private");
    setNoteVisibility(visibility);
    if (visibility === "private") {
      setToRecipientsInput("");
    }
    openComposerAndFocus();
  }, [openComposerAndFocus]);

  const handleQuickForward = useCallback(
    (opts?: { fromToolbar?: boolean }) => {
      const fromToolbar = opts?.fromToolbar === true;
      setComposeMode("forward");
      setComposeAsInternalNote(false);
      setNoteVisibility("private");
      if (fromToolbar) {
        setToRecipientsInput("");
        setShowToInput(false);
        const bFwd = (composeAuto?.defaultBcc ?? "").trim();
        setCcRecipientsInput(composeAuto?.defaultCc ?? "");
        setBccRecipientsInput(bFwd);
        setShowBccInput(Boolean(bFwd));
        setShowCcInput(Boolean((composeAuto?.defaultCc ?? "").trim()));
        if (replyBodyRef.current) replyBodyRef.current.innerHTML = "";
        setReplyText("");
      }
      openComposerAndFocus();

      const num = ticketNumber != null ? String(ticketNumber) : String(ticketId);
      const subj = (ticketSubject ?? "").trim();
      const toolbarTemplate = subj
        ? `---------- Forwarded message ----------\nTicket #${num}\nSubject: ${subj}\n\n`
        : `---------- Forwarded message ----------\nTicket #${num}\n\n`;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (fromToolbar) {
            insertAtEnd(toolbarTemplate);
          } else if ((replyBodyRef.current?.innerText ?? "").trim() === "") {
            insertAtEnd("Forwarded message:\n\n");
          }
        });
      });
    },
    [insertAtEnd, openComposerAndFocus, ticketId, ticketNumber, ticketSubject, composeAuto],
  );

  useEffect(() => {
    if (!quickComposeAction) return;
    if (handledQuickActionRef.current === quickComposeAction.nonce) return;
    handledQuickActionRef.current = quickComposeAction.nonce;
    if (quickComposeAction.type === "reply") {
      handleQuickReply();
      return;
    }
    if (quickComposeAction.type === "forward") {
      handleQuickForward({ fromToolbar: true });
      return;
    }
    if (quickComposeAction.type === "note_public") {
      handleQuickAddNote("public");
      return;
    }
    if (quickComposeAction.type === "note_private") {
      handleQuickAddNote("private");
      return;
    }
  }, [quickComposeAction, handleQuickReply, handleQuickForward, handleQuickAddNote]);

  const requestEdit = useCallback((message: TicketMessage) => {
    setEditTarget(message);
    setEditDraft(message.message ?? "");
  }, []);

  const requestDelete = useCallback((message: TicketMessage) => {
    setDeleteTarget(message);
  }, []);

  const submitEdit = useCallback(async () => {
    if (!editTarget) return;
    const text = editDraft.trim();
    if (!text) {
      toast("Message cannot be empty");
      return;
    }
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messageText: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast(data?.error ?? "Unable to edit message");
        return;
      }
      toast("Message updated");
      setEditTarget(null);
      setEditDraft("");
      onMessageSent?.();
    } catch {
      toast("Unable to edit message");
    } finally {
      setIsSavingEdit(false);
    }
  }, [editDraft, editTarget, onMessageSent, ticketId, toast]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/messages/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast(data?.error ?? "Unable to delete message");
        return;
      }
      toast("Message deleted");
      setDeleteTarget(null);
      onMessageSent?.();
    } catch {
      toast("Unable to delete message");
    } finally {
      setIsDeleting(false);
    }
  }, [deleteTarget, onMessageSent, ticketId, toast]);

  const handleSend = useCallback(
    async (statusForThisSend: string | null) => {
      const text = (replyBodyRef.current?.innerText ?? replyText).trim();
      const rawHtml = replyBodyRef.current?.innerHTML ?? "";
      const sanitizedHtml = sanitizeMessageHtml(rawHtml);
      if (!text && attachedFiles.length === 0) return;
      // Use exactly the status the user selected from dropdown; null/undefined = no change
      const statusToSet =
        statusForThisSend && statusForThisSend !== "no_change" ? statusForThisSend : null;
      setSending(true);
      setSendStatus(null);
      try {
        let attachmentsToSend: { storageKey: string; name: string; mimeType: string; url?: string }[] = [];
        if (attachedFiles.length > 0) {
          const formData = new FormData();
          attachedFiles.forEach((f) => formData.append("files", f));
          const upRes = await fetch(`/api/tickets/${ticketId}/upload`, {
            method: "POST",
            credentials: "include",
            body: formData,
          });
          const upData = await upRes.json();
          if (!upData.success) {
            setSendStatus(upData.error ?? "Upload failed");
            setSending(false);
            return;
          }
          attachmentsToSend = upData.data?.attachments ?? [];
        }

        const ccForSend = ccRecipientsInput;

        const res = await fetch(`/api/tickets/${ticketId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messageText: sanitizedHtml || text || "",
            messageType: composeAsInternalNote ? "INTERNAL_NOTE" : noteVisibility === "public" ? "PUBLIC_NOTE" : "TEXT",
            isInternalNote: composeAsInternalNote,
            noteVisibility: composeAsInternalNote ? "private" : noteVisibility === "public" ? "public" : undefined,
            attachments: attachmentsToSend,
            toRecipients: toRecipientsInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            ccRecipients: ccForSend
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
            bccRecipients: bccRecipientsInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setSendStatus(data.error ?? "Failed to send");
          setSending(false);
          return;
        }

        let newMessage = ticketMessageFromPostApi(data.data?.message as Record<string, unknown> | undefined, ticketId);
        if (!newMessage) {
          const tidParsed = typeof ticketId === "number" ? ticketId : Number(String(ticketId).trim());
          const nowIso = new Date().toISOString();
          const msgType = composeAsInternalNote ? "INTERNAL_NOTE" : noteVisibility === "public" ? "PUBLIC_NOTE" : "TEXT";
          const toCsv =
            toRecipientsInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .join(", ") || null;
          const ccCsv =
            ccRecipientsInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .join(", ") || null;
          const bccCsv =
            bccRecipientsInput
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .join(", ") || null;
          newMessage = {
            id: -Math.abs(Date.now()),
            ticketId: Number.isFinite(tidParsed) ? tidParsed : 0,
            senderType: "AGENT",
            senderId: null,
            senderName,
            senderEmail: senderEmail || null,
            messageType: msgType,
            isInternalNote: composeAsInternalNote,
            message: sanitizedHtml || text || "",
            attachments: attachmentsToSend,
            createdAt: nowIso,
            updatedAt: nowIso,
            emailRecipientTo: composeAsInternalNote || msgType !== "TEXT" ? null : toCsv,
            emailRecipientCc: composeAsInternalNote || msgType !== "TEXT" ? null : ccCsv,
            emailRecipientBcc: composeAsInternalNote || msgType !== "TEXT" ? null : bccCsv,
          };
        }
        const isFirstResponse = Boolean(data.data?.isFirstResponse);
        const emailDispatch = data.data?.emailDispatch as { ok?: boolean; code?: string } | undefined;
        const isCustomerEmailReply = !composeAsInternalNote && noteVisibility === "private";
        let showResponseSuccessToast = true;
        if (isCustomerEmailReply && emailDispatch && emailDispatch.ok === false) {
          const code = emailDispatch.code ?? "";
          if (code === "NO_RECIPIENT") {
            // Message is saved; do not show the old "add To address" toast.
          } else if (code === "NOT_CONFIGURED") {
            showResponseSuccessToast = false;
            toast(
              "Message saved. Set EMAIL_ID and EMAIL_APP_PASSWORD (Zoho SMTP) in .env.local to send customer emails.",
              "error"
            );
          } else {
            showResponseSuccessToast = false;
            toast("Message saved, but the customer email could not be sent. Check SMTP credentials.", "error");
          }
        }
        if (showResponseSuccessToast) {
          toast("Response successfully Updated");
        }
        let ticketStatusAfterSend: string | undefined;

        if (statusToSet) {
          const patchRes = await fetch(`/api/tickets/${ticketId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ status: statusToSet }),
          });
          const patchData = await patchRes.json().catch(() => ({ success: false }));
          if (!patchData.success) {
            toast(patchData.error ?? "Message sent but status update failed");
          } else {
            const statusLabel =
              SEND_STATUS_OPTIONS.find((o) => o.value === statusToSet)?.label?.replace(/^Send and set as /i, "") ??
              statusToSet;
            toast(`Status updated to ${statusLabel}`);
            ticketStatusAfterSend = statusToSet;
          }
        }

        setReplyText("");
        if (replyBodyRef.current) replyBodyRef.current.innerText = "";
        setComposeMode("reply");
        setComposeAsInternalNote(false);
        setNoteVisibility("private");
        setSendStatus(null);
        setAttachedFiles([]);
        setToRecipientsInput("");
        setShowToInput(false);
        const nextCc = composeAuto?.defaultCc ?? "";
        setCcRecipientsInput(nextCc);
        setShowCcInput(Boolean(nextCc.trim()));
        const nextBcc = (composeAuto?.defaultBcc ?? "").trim();
        setBccRecipientsInput(composeAuto?.defaultBcc ?? "");
        setShowBccInput(Boolean(nextBcc));
        onMessageSent?.({
          message: newMessage,
          ticketStatus: ticketStatusAfterSend,
          isFirstResponse,
        });
        onCloseReply?.();
        if (newMessage) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            });
          });
        }
      } catch {
        setSendStatus("Failed to send");
      } finally {
        setSending(false);
      }
    },
    [
      ticketId,
      replyText,
      attachedFiles,
      onMessageSent,
      onCloseReply,
      sanitizeMessageHtml,
      toast,
      toRecipientsInput,
      ccRecipientsInput,
      bccRecipientsInput,
      composeAsInternalNote,
      noteVisibility,
      composeAuto,
      senderName,
      senderEmail,
    ]
  );

  const execFormat = useCallback((cmd: string, value?: string) => {
    replyBodyRef.current?.focus();
    document.execCommand(cmd, false, value ?? undefined);
  }, []);

  const insertTemplate = useCallback((text: string) => {
    const el = replyBodyRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    if (sel && range) {
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    document.execCommand("insertText", false, text);
    setReplyText(el.innerText);
    setTemplatePicker(null);
  }, []);

  const handleReplyPaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    // Force plain-text paste at current caret so existing text does not jump.
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    replyBodyRef.current?.focus();
    document.execCommand("insertText", false, text);
    setReplyText(replyBodyRef.current?.innerText ?? "");
  }, []);

  const discardDraft = useCallback(() => {
    setShowDiscardConfirm(false);
    setReplyText("");
    if (replyBodyRef.current) replyBodyRef.current.innerText = "";
    setComposeMode("reply");
    setComposeAsInternalNote(false);
    setNoteVisibility("private");
    setSendStatus(null);
    setAttachedFiles([]);
    setTemplatePicker(null);
    setToRecipientsInput("");
    setShowToInput(false);
    const discCc = composeAuto?.defaultCc ?? "";
    setCcRecipientsInput(discCc);
    setShowCcInput(Boolean(discCc.trim()));
    const discBcc = (composeAuto?.defaultBcc ?? "").trim();
    setBccRecipientsInput(composeAuto?.defaultBcc ?? "");
    setShowBccInput(Boolean(discBcc));
    onCloseReply?.();
  }, [onCloseReply, composeAuto]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = sendOptionsRef.current?.contains(target) ?? false;
      const inDropdown = sendDropdownContentRef.current?.contains(target) ?? false;
      const inTemplates = templatesRef.current?.contains(target) ?? false;
      const inTemplatesTrigger = templatesTriggerRef.current?.contains(target) ?? false;
      const inNoteTypeMenu = noteTypeMenuRef.current?.contains(target) ?? false;
      if (!inTrigger && !inDropdown) setSendOptionsOpen(false);
      if (!inTemplates && !inTemplatesTrigger) setTemplatePicker(null);
      if (!inNoteTypeMenu) setShowNoteTypeMenu(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sendOptionsOpen]);

  return (
    <div
      className={`flex flex-col ${
        embedded
          ? `${noScroll ? "" : "flex-1 min-h-0"}`
          : `rounded-lg border border-gray-200 bg-white ${noScroll ? "" : "flex-1 min-h-0"}`
      }`}
    >
      <div ref={conversationScrollRef} className={noScroll ? "min-h-0 space-y-3.5 p-3.5" : "flex-1 min-h-0 overflow-y-auto space-y-3.5 p-3.5"}>
        {messages.length === 0 ? null : (
          <>
            {topMessages.map((msg) => (
              <MessageBlock key={msg.id} msg={msg} recipientEmail={recipientEmail} senderDisplayName={senderDisplayName} formatMessageTimeLong={formatMessageTimeLong} initial={initial} avatarBgClass={avatarBgClass} currentUserEmail={senderEmail} downloadNamePrefix={downloadNamePrefix} onEditRequest={requestEdit} onDeleteRequest={requestDelete} showBottomActions={msg.id === lastMessageId} onReplyAction={handleQuickReply} onAddNoteAction={handleQuickAddNote} onForwardAction={() => handleQuickForward({ fromToolbar: true })} />
            ))}
            {middleMessages.map((msg) => (
              <MessageBlock key={msg.id} msg={msg} recipientEmail={recipientEmail} senderDisplayName={senderDisplayName} formatMessageTimeLong={formatMessageTimeLong} initial={initial} avatarBgClass={avatarBgClass} currentUserEmail={senderEmail} downloadNamePrefix={downloadNamePrefix} onEditRequest={requestEdit} onDeleteRequest={requestDelete} showBottomActions={msg.id === lastMessageId} onReplyAction={handleQuickReply} onAddNoteAction={handleQuickAddNote} onForwardAction={() => handleQuickForward({ fromToolbar: true })} />
            ))}
            {showExpandBadge && hasMoreToExpand && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={() => setExpandedMiddleCount((c) => Math.min(c + CONVERSATION_EXPAND_STEP, maxMiddle))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span className="text-blue-600">+{hiddenCount}</span>
                  <span> conversation{hiddenCount !== 1 ? "s" : ""} hidden</span>
                </button>
              </div>
            )}
            {bottomMessages.map((msg) => (
              <MessageBlock key={msg.id} msg={msg} recipientEmail={recipientEmail} senderDisplayName={senderDisplayName} formatMessageTimeLong={formatMessageTimeLong} initial={initial} avatarBgClass={avatarBgClass} currentUserEmail={senderEmail} downloadNamePrefix={downloadNamePrefix} onEditRequest={requestEdit} onDeleteRequest={requestDelete} showBottomActions={msg.id === lastMessageId} onReplyAction={handleQuickReply} onAddNoteAction={handleQuickAddNote} onForwardAction={() => handleQuickForward({ fromToolbar: true })} />
            ))}
          </>
        )}
        <div ref={bottomRef} />

        {/* Reply composer — in normal document flow only (no fixed/sticky); scrolls with page so it never overlaps content */}
        {replyVisible && (
          <div id="reply" className="relative rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden min-h-[320px] flex flex-col mt-4">
          {/* Compact header: From (avatar + name (email)) + To + Cc/Bcc + Expand/Close */}
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold text-blue-600">
                  {fromLetter}
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-gray-700">
                    <span className="font-medium text-gray-900">From: </span>
                    <span className="text-gray-700">
                      {senderName}
                      {senderEmail ? ` (${senderEmail})` : ""}
                    </span>
                    {(composeAsInternalNote || noteVisibility === "public") && (
                      <span className="relative ml-2 inline-flex" ref={noteTypeMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShowNoteTypeMenu((v) => !v)}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-[#3b82f6] bg-white px-2 text-[12px] font-medium text-[#1d4ed8] hover:bg-[#eff6ff]"
                        >
                          {noteVisibility === "private" ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                          {noteVisibility === "private" ? "Private" : "Public"}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                        {showNoteTypeMenu && (
                          <div className="absolute left-0 top-[calc(100%+4px)] z-30 w-52 rounded-md border border-gray-200 bg-white p-1.5 shadow-[0_6px_24px_rgba(15,23,42,0.12)]">
                            <p className="px-2 pb-1 text-[12px] font-medium text-gray-500">Mark note as</p>
                            <button
                              type="button"
                              onClick={() => {
                                setComposeAsInternalNote(false);
                                setNoteVisibility("public");
                                setShowNoteTypeMenu(false);
                              }}
                              className={`flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left ${
                                noteVisibility === "public" ? "bg-[#eaf3ff] text-[#1d4ed8]" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span className="flex items-start gap-2">
                                <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                  <span className="block text-[12px] font-medium leading-4">Public</span>
                                  <span className="mt-0.5 block text-[11px] leading-3.5 text-gray-500">Visible to contact</span>
                                </span>
                              </span>
                              {noteVisibility === "public" ? <Check className="mt-0.5 h-3.5 w-3.5" /> : null}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setComposeAsInternalNote(true);
                                setNoteVisibility("private");
                                setToRecipientsInput("");
                                setShowNoteTypeMenu(false);
                              }}
                              className={`mt-1 flex w-full items-start justify-between rounded-md px-2 py-1.5 text-left ${
                                noteVisibility === "private" ? "bg-[#eaf3ff] text-[#1d4ed8]" : "text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              <span className="flex items-start gap-2">
                                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <span>
                                  <span className="block text-[12px] font-medium leading-4">Private</span>
                                  <span className="mt-0.5 block text-[11px] leading-3.5 text-gray-500">Private</span>
                                </span>
                              </span>
                              {noteVisibility === "private" ? <Check className="mt-0.5 h-3.5 w-3.5" /> : null}
                            </button>
                          </div>
                        )}
                      </span>
                    )}
                  </div>
                  {!composeAsInternalNote && (
                    <div
                      id="ticket-compose-recipients"
                      className="text-xs text-gray-500 mt-0.5 flex w-full min-w-0 flex-col gap-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <button
                          id="ticket-compose-to-toggle"
                          type="button"
                          onClick={() => setShowToInput((v) => !v)}
                          className={`cursor-pointer shrink-0 bg-transparent p-0 hover:underline ${
                            showToInput || toRecipientsInput.trim() !== ""
                              ? "font-medium text-gray-800"
                              : "text-blue-600"
                          }`}
                        >
                          To
                        </button>
                        <button
                          id="ticket-compose-cc-toggle"
                          type="button"
                          onClick={() => setShowCcInput((v) => !v)}
                          className={`cursor-pointer shrink-0 bg-transparent p-0 hover:underline ${
                            showCcInput ? "font-medium text-gray-800" : "text-blue-600"
                          }`}
                        >
                          Cc
                        </button>
                        <button
                          id="ticket-compose-bcc-toggle"
                          type="button"
                          onClick={() => setShowBccInput((v) => !v)}
                          className={`cursor-pointer shrink-0 bg-transparent p-0 hover:underline ${
                            showBccInput ? "font-medium text-gray-800" : "text-blue-600"
                          }`}
                        >
                          Bcc
                        </button>
                      </div>
                      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                        {(showToInput || toRecipientsInput.trim() !== "") && (
                          <div
                            id="ticket-compose-to-field"
                            className="flex min-w-0 flex-1 basis-0 items-center gap-2"
                          >
                            <span className="shrink-0">To:</span>
                            <input
                              id="ticket-compose-to-input"
                              type="text"
                              value={toRecipientsInput}
                              onChange={(e) => setToRecipientsInput(e.target.value)}
                              placeholder="Add emails, comma separated"
                              className="h-7 min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              id="ticket-compose-to-clear"
                              type="button"
                              onClick={() => setToRecipientsInput("")}
                              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              aria-label="Clear To recipients"
                              title="Clear To"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {showCcInput && (
                          <div
                            id="ticket-compose-cc-field"
                            className="flex min-w-0 flex-1 basis-0 items-center gap-2"
                          >
                            <span className="shrink-0">Cc:</span>
                            <input
                              id="ticket-compose-cc-input"
                              type="text"
                              value={ccRecipientsInput}
                              onChange={(e) => setCcRecipientsInput(e.target.value)}
                              placeholder="Add emails, comma separated"
                              className="h-7 min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              id="ticket-compose-cc-clear"
                              type="button"
                              onClick={() => setCcRecipientsInput("")}
                              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              aria-label="Clear Cc recipients"
                              title="Clear Cc"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {showBccInput && (
                          <div
                            id="ticket-compose-bcc-field"
                            className="flex min-w-0 flex-1 basis-0 items-center gap-2"
                          >
                            <span className="shrink-0">Bcc:</span>
                            <input
                              id="ticket-compose-bcc-input"
                              type="text"
                              value={bccRecipientsInput}
                              onChange={(e) => setBccRecipientsInput(e.target.value)}
                              placeholder="Add emails, comma separated"
                              className="h-7 min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              id="ticket-compose-bcc-clear"
                              type="button"
                              onClick={() => setBccRecipientsInput("")}
                              className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              aria-label="Clear Bcc recipients"
                              title="Clear Bcc"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Expand">
                  <Maximize2 className="h-4 w-4" />
                </button>
                {onCloseReply && (
                  <button type="button" onClick={() => setShowDiscardConfirm(true)} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Close reply">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Message body: contentEditable so toolbar formatting works */}
          <label htmlFor="reply-message" className="sr-only">Reply</label>
          <div
            ref={replyBodyRef}
            id="reply-message"
            role="textbox"
            contentEditable
            suppressContentEditableWarning
            onInput={() => setReplyText(replyBodyRef.current?.innerText ?? "")}
            onPaste={handleReplyPaste}
            data-placeholder="Type your reply…"
            className="w-full flex-1 min-h-[180px] border-0 border-b border-gray-100 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-0 overflow-y-auto empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
          />

          {/* Formatting toolbar — all buttons use execCommand */}
          <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-gray-50/50">
            <button type="button" onClick={() => execFormat("removeFormat")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="More options"><MoreHorizontal className="h-4 w-4" /></button>
            <span className="w-px h-4 bg-gray-200 mx-0.5" />
            <button type="button" onClick={() => execFormat("bold")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Bold"><Bold className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("italic")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Italic"><Italic className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("underline")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Underline"><Underline className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("foreColor", "#000000")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 flex items-center gap-0.5" aria-label="Text color"><span className="text-xs font-bold">A</span><ChevronDown className="h-3 w-3" /></button>
            <span className="w-px h-4 bg-gray-200 mx-0.5" />
            <button type="button" onClick={() => execFormat("insertUnorderedList")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Bullet list"><List className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("insertOrderedList")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Numbered list"><ListOrdered className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("indent")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Indent"><IndentIncrease className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("outdent")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Outdent"><IndentDecrease className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("justifyLeft")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Align left"><AlignLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("justifyCenter")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Align center"><AlignCenter className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("justifyRight")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Align right"><AlignRight className="h-4 w-4" /></button>
            <button type="button" onClick={() => { const url = window.prompt("Enter URL:"); if (url) execFormat("createLink", url); }} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Link"><Link className="h-4 w-4" /></button>
            <button type="button" onClick={() => { const url = window.prompt("Image URL:"); if (url) execFormat("insertImage", url); }} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Image"><Image className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("insertHorizontalRule")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Divider"><Table className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("formatBlock", "pre")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Code"><Code className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("removeFormat")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Clear formatting"><Eraser className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("undo")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>
            <button type="button" onClick={() => execFormat("redo")} className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Redo"><Redo2 className="h-4 w-4" /></button>
          </div>

          {/* Bottom action bar: attachments, templates, KB | Saved, trash, Send with dropdown */}
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/50 px-3 py-2">
            <div ref={templatesTriggerRef} className="relative flex min-w-0 flex-1 flex-wrap items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                accept="image/*,application/pdf,.pdf,.csv,.xls,.xlsx,.doc,.docx,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => {
                  const f = e.target.files;
                  if (f?.length) setAttachedFiles((prev) => [...prev, ...Array.from(f)]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => fileInputRef.current?.click()}
                className={`p-2 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-40 ${sending ? "cursor-not-allowed" : "cursor-pointer"}`}
                title="Attach images, PDF, Excel, Word (max 50MB each)"
                aria-label="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setTemplatePicker((p) => (p === "quick" ? null : "quick"))}
                className={`cursor-pointer p-2 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 ${
                  templatePicker === "quick" ? "bg-gray-200 text-gray-800" : ""
                }`}
                title="Short canned replies"
                aria-label="Quick reply templates"
              >
                <Star className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setTemplatePicker((p) => (p === "kb" ? null : "kb"))}
                className={`cursor-pointer p-2 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700 ${
                  templatePicker === "kb" ? "bg-gray-200 text-gray-800" : ""
                }`}
                title="Policies, timelines, and how-to wording"
                aria-label="Knowledge base snippets"
              >
                <BookOpen className="h-4 w-4" />
              </button>
              {attachedFiles.length > 0 && (
                <div className="flex max-w-full flex-wrap items-center gap-1">
                  {attachedFiles.map((f, i) => (
                    <span
                      key={`${f.name}-${i}-${f.size}`}
                      className="inline-flex max-w-[200px] items-center gap-0.5 rounded border border-emerald-300/90 bg-emerald-50 pl-2 pr-1 py-0.5 text-[10px] font-medium text-emerald-900 shadow-sm"
                      title={f.name}
                    >
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 rounded p-0.5 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-950 disabled:pointer-events-none disabled:opacity-40"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {templatePicker && (
                <div ref={templatesRef} className="absolute left-0 bottom-full mb-1 w-64 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-10">
                  <p className="px-2 py-1 text-[10px] font-medium text-gray-500 uppercase">
                    {templatePicker === "quick" ? "Quick reply" : "Knowledge base"}
                  </p>
                  {(templatePicker === "quick" ? QUICK_REPLY_TEMPLATES : KNOWLEDGE_BASE_SNIPPETS).map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => insertTemplate(t)}
                      className="w-full px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                      title={t}
                    >
                      <span className="line-clamp-2">{t}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2" ref={sendOptionsRef}>
              {sending ? (
                <span className="text-xs font-medium text-blue-600" aria-live="polite">
                  Sending…
                </span>
              ) : hasComposerDraft ? (
                <span className="text-xs text-gray-400">Draft</span>
              ) : null}
              <button
                type="button"
                disabled={sending}
                onClick={() => setShowDiscardConfirm(true)}
                className="p-2 rounded text-red-600 hover:bg-red-50 hover:text-red-700 disabled:pointer-events-none disabled:opacity-40"
                aria-label="Delete draft"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {composeAsInternalNote || noteVisibility === "public" ? (
                <button
                  type="button"
                  disabled={sending || (!replyText.trim() && attachedFiles.length === 0)}
                  onClick={() => handleSend("no_change")}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  Add note
                </button>
              ) : (
                <div className="relative flex rounded-lg overflow-hidden">
                  <button
                    type="button"
                    disabled={sending || (!replyText.trim() && attachedFiles.length === 0)}
                    onClick={() => handleSend(sendStatus ?? "no_change")}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-l-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send className="h-4 w-4" />
                    Send
                  </button>
                  <button
                    ref={sendDropdownTriggerRef}
                    type="button"
                    disabled={sending}
                    onClick={openSendOptions}
                    className="cursor-pointer rounded-r-lg border-l border-blue-500 bg-blue-600 px-1.5 py-1.5 text-white hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50"
                    aria-label="Send options"
                    aria-expanded={sendOptionsOpen}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            {/* Status list modal — only for normal Send (not note mode). */}
            {!(composeAsInternalNote || noteVisibility === "public") && sendOptionsOpen && typeof document !== "undefined" && createPortal(
              <div
                ref={sendDropdownContentRef}
                className="fixed z-[100] w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-xl max-h-64 overflow-y-auto"
                style={
                  sendDropdownPosition
                    ? { bottom: sendDropdownPosition.bottom, left: sendDropdownPosition.left }
                    : { bottom: "1rem", right: "1rem" }
                }
                role="dialog"
                aria-label="Send & set status"
              >
                <p className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100 sticky top-0 bg-white">
                  Send & set status
                </p>
                {SEND_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="w-full cursor-pointer px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                    onClick={() => {
                      setSendOptionsOpen(false);
                      if (replyText.trim()) {
                        handleSend(opt.value);
                      } else {
                        setSendStatus(opt.value);
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>,
              document.body
            )}
            {/* Discard draft confirmation modal — centered on page, not browser default */}
            {showDiscardConfirm && typeof document !== "undefined" && createPortal(
              <div
                className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50"
                role="dialog"
                aria-modal="true"
                aria-labelledby="discard-draft-title"
                onClick={(e) => e.target === e.currentTarget && setShowDiscardConfirm(false)}
              >
                <div
                  className="rounded-xl border border-gray-200 bg-white shadow-xl p-5 w-full max-w-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <h2 id="discard-draft-title" className="text-base font-semibold text-gray-900 mb-1">
                    Discard draft?
                  </h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Your reply and any attachments will be removed. This cannot be undone.
                  </p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDiscardConfirm(false)}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={discardDraft}
                      className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>
        </div>
      )}
      {editTarget && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-message-title"
          onClick={(e) => e.target === e.currentTarget && !isSavingEdit && setEditTarget(null)}
        >
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="edit-message-title" className="text-base font-semibold text-gray-900">Edit message?</h2>
            <p className="mt-1 text-sm text-gray-500">
              You can edit only within 5 minutes after sending.
            </p>
            <textarea
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              className="mt-3 min-h-[120px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                disabled={isSavingEdit}
                className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitEdit()}
                disabled={isSavingEdit}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSavingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {deleteTarget && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-message-title"
          onClick={(e) => e.target === e.currentTarget && !isDeleting && setDeleteTarget(null)}
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 id="delete-message-title" className="text-base font-semibold text-gray-900">Delete message?</h2>
            <p className="mt-1 text-sm text-gray-500">
              Deleting this will remove the chat from the participant and cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete()}
                disabled={isDeleting}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      </div>
    </div>
  );
}