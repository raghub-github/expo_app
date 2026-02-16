"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  MessageSquare,
  StickyNote,
  Forward,
  GitMerge,
  XCircle,
  UserPlus,
  Activity,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";

interface TicketActionBarProps {
  ticketId: number;
  ticketNumber: string;
  showActivities: boolean;
  onToggleActivities: () => void;
  onReplyClick?: () => void;
}

export function TicketActionBar({
  ticketId,
  ticketNumber,
  showActivities,
  onToggleActivities,
  onReplyClick,
}: TicketActionBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleReply = () => {
    onReplyClick?.();
    if (typeof window !== "undefined") {
      window.location.hash = "reply";
      setTimeout(() => document.getElementById("reply")?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Reply: shows reply section and scrolls to it */}
      <button
        type="button"
        onClick={handleReply}
        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
      >
        <MessageSquare className="h-3.5 w-3.5" />
        Reply
      </button>

      <Link
        href={`/dashboard/tickets/${ticketId}#note`}
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <StickyNote className="h-3.5 w-3.5" />
        Add note
      </Link>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <Forward className="h-3.5 w-3.5" />
        Forward
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <GitMerge className="h-3.5 w-3.5" />
        Merge
      </button>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        <XCircle className="h-3.5 w-3.5" />
        Close
      </button>

      {/* More dropdown: Assign, Change Status, Priority, Spam */}
      <div className="relative" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white p-1.5 text-gray-600 hover:bg-gray-50"
          aria-label="More actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {moreOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              <UserPlus className="h-4 w-4" /> Assign
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Change Status
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              Priority
            </button>
            <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
              Spam
            </button>
          </div>
        )}
      </div>

      <div className="flex-1" />

      {/* Show / Hide activities */}
      <button
        type="button"
        onClick={onToggleActivities}
        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
          showActivities ? "bg-gray-200 text-gray-800" : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Activity className="h-3.5 w-3.5" />
        {showActivities ? "Hide activities" : "Show activities"}
      </button>

      {/* Prev / Next ticket */}
      <div className="flex items-center rounded-lg border border-gray-300 bg-white p-0.5">
        <Link
          href={`/dashboard/tickets?near=${ticketId}&dir=prev`}
          className="rounded p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Previous ticket"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <Link
          href={`/dashboard/tickets?near=${ticketId}&dir=next`}
          className="rounded p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Next ticket"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
