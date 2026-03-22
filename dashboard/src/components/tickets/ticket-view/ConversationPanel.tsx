"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  Mail,
  Reply,
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
  Eraser,
  Undo2,
  Redo2,
  MoreHorizontal,
} from "lucide-react";
import type { TicketMessage } from "@/hooks/tickets/useTicketDetail";
import { useSignedAttachmentUrl } from "@/hooks/tickets/useSignedAttachmentUrl";
import { AttachmentModal, isImageUrl } from "./AttachmentModal";
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
  const short = formatMessageTime(createdAt);
  const long = date.toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${short} (${long})`;
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
}: {
  attachment: { url?: string; storageKey?: string; name?: string; mimeType?: string };
}) {
  const [showModal, setShowModal] = useState(false);
  const storageKey = attachment.storageKey ?? null;
  const { url: signedUrl, error } = useSignedAttachmentUrl(storageKey);
  const url = attachment.url || signedUrl || (error ? undefined : "");
  const name = attachment.name || "Attachment";
  const isImage = isImageAttachment(attachment) || (!!url && isImageUrl(url));

  if (storageKey && !url && !error) return <span className="text-xs text-gray-400">Loading…</span>;
  if (!url && error) return <span className="text-xs text-gray-500">{name} (unavailable)</span>;

  if (isImage && url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-1.5 shadow-sm hover:border-gray-300 hover:shadow transition-shadow text-left"
        >
          <span className="shrink-0 w-12 h-12 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
            <img src={url} alt="" className="w-full h-full object-cover" />
          </span>
          <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{name}</span>
        </button>
        {showModal && (
          <AttachmentModal url={url} name={name} onClose={() => setShowModal(false)} />
        )}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => url && setShowModal(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-blue-600 hover:bg-gray-50 shadow-sm"
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-[140px]">{name}</span>
      </button>
      {showModal && url && (
        <AttachmentModal url={url} name={name} onClose={() => setShowModal(false)} />
      )}
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
}: {
  msg: TicketMessage;
  recipientEmail: string | null;
  senderDisplayName: (m: TicketMessage) => string;
  formatMessageTimeLong: (s: string) => string;
  initial: (s: string) => string;
  avatarBgClass: (t: string, p: boolean) => string;
  currentUserEmail: string | null;
}) {
  const isPrivate = (msg.messageType || "").toLowerCase() === "internal_note";
  const displayName = senderDisplayName(msg);
  // Sender (agent) = right, chat-style. Incoming (User/Merchant/Rider/Customer) = left.
  const hasAgentType = isAgentMessage(msg);
  const senderTypeEmpty = !(msg.senderType ?? "").trim();
  const sameAsLoggedIn = Boolean(
    currentUserEmail && msg.senderEmail && String(currentUserEmail).trim() === String(msg.senderEmail).trim()
  );
  const fromAgent = hasAgentType || (senderTypeEmpty && sameAsLoggedIn);
  // Tag by sender: Agent → "Replied", incoming → "Received", internal note → "added a note"
  const actionText = isPrivate ? "added a note" : fromAgent ? "Replied" : "Received";
  const cardBg = isPrivate
    ? "bg-amber-50/60 border-amber-100"
    : fromAgent
      ? "bg-blue-50/80 border-blue-100"
      : "bg-slate-50/80 border-slate-200";
  return (
    <div className={`flex w-full ${fromAgent ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex gap-3 rounded-xl p-3 border w-full ${fromAgent ? "flex-row-reverse" : "flex-row"} ${cardBg}`}
      >
        <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${avatarBgClass(msg.senderType, isPrivate)}`}>
          {initial(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm">
            <span className="font-medium text-blue-600">{displayName}</span>
            <span className="text-gray-700"> {actionText}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {formatMessageTimeLong(msg.createdAt)}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500">
            <Mail className="h-3 w-3 shrink-0" />
            <span>To: {recipientEmail || "—"}</span>
          </div>
          <div className="mt-1.5 text-sm text-gray-700 whitespace-pre-wrap break-words">
            {msg.message}
          </div>
          {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {msg.attachments.map((a: { name?: string; url?: string; storageKey?: string; mimeType?: string }, i: number) => (
                <MessageAttachment key={i} attachment={a} />
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className="shrink-0 self-start p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200/80"
          aria-label="Reply to this message"
        >
          <Reply className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ConversationPanelProps {
  ticketId: number;
  messages: TicketMessage[];
  /** Email of the user who raised the ticket (for "To:" in each reply block). */
  recipientEmail?: string | null;
  onMessageSent?: () => void;
  /** When false, reply editor is hidden; shown when user clicks Reply in action bar. */
  replyVisible?: boolean;
  /** Callback to close/collapse the reply section. */
  onCloseReply?: () => void;
  /** When true, do not add a separate scrollbar; content flows with the page. */
  noScroll?: boolean;
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
  messages,
  recipientEmail = null,
  onMessageSent,
  replyVisible = false,
  onCloseReply,
  noScroll = false,
}: ConversationPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const conversationScrollRef = useRef<HTMLDivElement>(null);
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const sendOptionsRef = useRef<HTMLDivElement>(null);
  const sendDropdownTriggerRef = useRef<HTMLButtonElement>(null);
  const sendDropdownContentRef = useRef<HTMLDivElement>(null);
  const [sendDropdownPosition, setSendDropdownPosition] = useState<{ bottom: number; left: number } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [expandedMiddleCount, setExpandedMiddleCount] = useState(0);
  const { senderName, senderEmail, fromLetter } = useSenderFromSession();

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
  const [showTemplates, setShowTemplates] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const templatesRef = useRef<HTMLDivElement>(null);
  const templatesTriggerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handleSend = useCallback(
    async (statusForThisSend: string | null) => {
      const text = (replyBodyRef.current?.innerText ?? replyText).trim();
      if (!text && attachedFiles.length === 0) return;
      // Use exactly the status the user selected from dropdown; null/undefined = no change
      const statusToSet =
        statusForThisSend && statusForThisSend !== "no_change" ? statusForThisSend : null;
      setSending(true);
      setSendStatus(null);
      try {
        let attachmentsToSend: { storageKey: string; name: string; mimeType: string }[] = [];
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

        const res = await fetch(`/api/tickets/${ticketId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            messageText: text || "",
            messageType: "TEXT",
            isInternalNote: false,
            attachments: attachmentsToSend,
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setSendStatus(data.error ?? "Failed to send");
          setSending(false);
          return;
        }

        if (statusToSet) {
          const patchRes = await fetch(`/api/tickets/${ticketId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ status: statusToSet }),
          });
          const patchData = await patchRes.json().catch(() => ({ success: false }));
          if (!patchData.success) {
            setSendStatus(patchData.error ?? "Message sent but status update failed");
            setSending(false);
            return;
          }
          const statusLabel =
            SEND_STATUS_OPTIONS.find((o) => o.value === statusToSet)?.label?.replace(/^Send and set as /i, "") ??
            statusToSet;
          toast(`Status updated to ${statusLabel}`);
        }

        setReplyText("");
        if (replyBodyRef.current) replyBodyRef.current.innerText = "";
        setSendStatus(null);
        setAttachedFiles([]);
        onMessageSent?.();
        onCloseReply?.();
      } catch {
        setSendStatus("Failed to send");
      } finally {
        setSending(false);
      }
    },
    [ticketId, replyText, attachedFiles, onMessageSent, onCloseReply, toast]
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
    setShowTemplates(false);
  }, []);

  const discardDraft = useCallback(() => {
    setShowDiscardConfirm(false);
    setReplyText("");
    if (replyBodyRef.current) replyBodyRef.current.innerText = "";
    setSendStatus(null);
    setAttachedFiles([]);
    setShowTemplates(false);
    onCloseReply?.();
  }, [onCloseReply]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const inTrigger = sendOptionsRef.current?.contains(target) ?? false;
      const inDropdown = sendDropdownContentRef.current?.contains(target) ?? false;
      const inTemplates = templatesRef.current?.contains(target) ?? false;
      const inTemplatesTrigger = templatesTriggerRef.current?.contains(target) ?? false;
      if (!inTrigger && !inDropdown) setSendOptionsOpen(false);
      if (!inTemplates && !inTemplatesTrigger) setShowTemplates(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [sendOptionsOpen]);

  return (
    <div className={`flex flex-col rounded-lg border border-gray-200 bg-white ${noScroll ? "" : "flex-1 min-h-0"}`}>
      <div className="border-b border-gray-200 px-4 py-2.5 shrink-0">
        <h2 className="text-sm font-semibold text-gray-900">Conversation</h2>
      </div>
      <div ref={conversationScrollRef} className={noScroll ? "p-4 space-y-4 min-h-0" : "flex-1 min-h-0 overflow-y-auto p-4 space-y-4"}>
        {messages.length === 0 ? (
          <p className="text-sm text-gray-500">No messages yet.</p>
        ) : (
          <>
            {topMessages.map((msg) => (
              <MessageBlock key={msg.id} msg={msg} recipientEmail={recipientEmail} senderDisplayName={senderDisplayName} formatMessageTimeLong={formatMessageTimeLong} initial={initial} avatarBgClass={avatarBgClass} currentUserEmail={senderEmail} />
            ))}
            {middleMessages.map((msg) => (
              <MessageBlock key={msg.id} msg={msg} recipientEmail={recipientEmail} senderDisplayName={senderDisplayName} formatMessageTimeLong={formatMessageTimeLong} initial={initial} avatarBgClass={avatarBgClass} currentUserEmail={senderEmail} />
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
              <MessageBlock key={msg.id} msg={msg} recipientEmail={recipientEmail} senderDisplayName={senderDisplayName} formatMessageTimeLong={formatMessageTimeLong} initial={initial} avatarBgClass={avatarBgClass} currentUserEmail={senderEmail} />
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
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>To: {recipientEmail || "—"}</span>
                    <button type="button" className="text-blue-600 hover:underline">Cc</button>
                    <button type="button" className="text-blue-600 hover:underline">Bcc</button>
                  </div>
                </div>
                <button type="button" className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Reply options">
                  <Reply className="h-3.5 w-3.5" />
                </button>
                <button type="button" className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="More">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Expand">
                  <Maximize2 className="h-4 w-4" />
                </button>
                {onCloseReply && (
                  <button type="button" onClick={onCloseReply} className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100" aria-label="Close reply">
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
            data-placeholder="Type your reply…"
            className="w-full border-0 border-b border-gray-100 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-0 min-h-[140px] max-h-[320px] overflow-y-auto resize-y empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400"
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
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50/50 border-t border-gray-100">
            <div ref={templatesTriggerRef} className="flex items-center gap-1 relative">
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { const f = e.target.files; if (f?.length) setAttachedFiles(Array.from(f)); e.target.value = ""; }} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Attachments"><Paperclip className="h-4 w-4" /></button>
              <button type="button" onClick={() => setShowTemplates((v) => !v)} className="p-2 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Templates"><Star className="h-4 w-4" /></button>
              <button type="button" onClick={() => setShowTemplates((v) => !v)} className="p-2 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700" aria-label="Knowledge base"><BookOpen className="h-4 w-4" /></button>
              {attachedFiles.length > 0 && <span className="text-[10px] text-gray-500">{attachedFiles.length} file(s)</span>}
              {showTemplates && (
                <div ref={templatesRef} className="absolute left-0 bottom-full mb-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg z-10">
                  <p className="px-2 py-1 text-[10px] font-medium text-gray-500 uppercase">Insert template</p>
                  {["Thank you for contacting us. We will get back to you shortly.", "We have received your request and are looking into it.", "Could you please provide more details?", "This has been resolved. Let us know if you need anything else."].map((t, i) => (
                    <button key={i} type="button" onClick={() => insertTemplate(t)} className="w-full px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 truncate" title={t}>{t.slice(0, 40)}…</button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2" ref={sendOptionsRef}>
              <span className="text-xs text-gray-400">{sending ? "Sending…" : "Saved"}</span>
              <button type="button" onClick={() => setShowDiscardConfirm(true)} className="p-2 rounded text-red-600 hover:bg-red-50 hover:text-red-700" aria-label="Delete draft"><Trash2 className="h-4 w-4" /></button>
              <div className="relative flex rounded-lg overflow-hidden">
                <button
                  type="button"
                  disabled={sending || (!replyText.trim() && attachedFiles.length === 0)}
                  onClick={() => handleSend(sendStatus ?? "no_change")}
                  className="inline-flex items-center gap-1.5 rounded-l-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                  Send
                </button>
                <button
                  ref={sendDropdownTriggerRef}
                  type="button"
                  onClick={openSendOptions}
                  className="rounded-r-lg bg-blue-600 px-1.5 py-1.5 text-white hover:bg-blue-700 border-l border-blue-500"
                  aria-label="Send options"
                  aria-expanded={sendOptionsOpen}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            </div>
            {/* Status list modal — portal so it's not clipped by overflow; same list as before */}
            {sendOptionsOpen && typeof document !== "undefined" && createPortal(
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
                <p className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100 sticky top-0 bg-white">Send & set status</p>
                {SEND_STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50 whitespace-nowrap"
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
      </div>
    </div>
  );
}