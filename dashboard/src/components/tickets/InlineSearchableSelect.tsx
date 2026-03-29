"use client";

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

export type Option = { value: string; label: string };

interface InlineSearchableSelectProps {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** For assignee: show "Unassigned" option and allow null */
  allowUnset?: boolean;
  unsetLabel?: string;
  /** Optional icon or color indicator (e.g. priority dot) */
  leadingIcon?: React.ReactNode;
  /** Override displayed label (e.g. "Group / Agent" for assignee) */
  customDisplayLabel?: string;
  /** Button takes full width of container (for vertical stack) */
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
  /** For agent dropdown: show which agent is currently assigned */
  assignedAgentId?: number;
  /** Fallback label to display if value is not found in options (e.g. assignee name) */
  fallbackLabel?: string;
  /** Size the floating list to the trigger width (avoids narrow w-52 over wide fields). */
  dropdownMatchTriggerWidth?: boolean;
  /** When false, hide the search row (compact lists e.g. status). */
  showSearch?: boolean;
}

export function InlineSearchableSelect({
  value,
  options,
  onChange,
  placeholder = "Select…",
  allowUnset,
  unsetLabel = "Unassigned",
  leadingIcon,
  customDisplayLabel,
  fullWidth,
  className = "",
  disabled,
  assignedAgentId,
  fallbackLabel,
  dropdownMatchTriggerWidth,
  showSearch = true,
}: InlineSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUpward, setOpenUpward] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setDropdownStyle({});
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const buttonRect = buttonRef.current.getBoundingClientRect();
    const triggerW = dropdownMatchTriggerWidth
      ? Math.min(buttonRect.width, window.innerWidth - buttonRect.left - 8)
      : 208;
    const dropdownWidth = triggerW;
    const spaceBelow = window.innerHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const dropdownHeight = showSearch ? 250 : 400;
    const shouldOpenUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
    setOpenUpward(shouldOpenUp);

    const wouldOverflowRight = buttonRect.left + dropdownWidth > window.innerWidth;
    const cap = showSearch ? 250 : 400;
    const maxH = shouldOpenUp
      ? Math.max(150, Math.min(cap, buttonRect.top - 20))
      : Math.max(150, Math.min(cap, window.innerHeight - buttonRect.bottom - 20));
    const maxW = buttonRect.left + dropdownWidth > window.innerWidth
      ? Math.min(dropdownWidth, window.innerWidth - buttonRect.left - 8)
      : dropdownWidth;

    const style: React.CSSProperties = {
      maxHeight: `${maxH}px`,
      maxWidth: `${maxW}px`,
      overflowY: "auto",
      ...(dropdownMatchTriggerWidth
        ? { width: `${maxW}px`, minWidth: `${Math.min(buttonRect.width, maxW)}px` }
        : {}),
    };
    if (shouldOpenUp) {
      style.bottom = `${window.innerHeight - buttonRect.top + 4}px`;
      style.top = "auto";
      if (wouldOverflowRight) {
        style.right = `${window.innerWidth - buttonRect.right}px`;
        style.left = "auto";
      } else {
        style.left = `${buttonRect.left}px`;
        style.right = "auto";
      }
    } else {
      style.top = `${buttonRect.bottom + 4}px`;
      style.bottom = "auto";
      if (wouldOverflowRight) {
        style.right = `${window.innerWidth - buttonRect.right}px`;
        style.left = "auto";
      } else {
        style.left = `${buttonRect.left}px`;
        style.right = "auto";
      }
    }
    setDropdownStyle(style);
  }, [open, dropdownMatchTriggerWidth, showSearch]);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inButton = ref.current?.contains(target);
      const inDropdown = dropdownRef.current?.contains(target);
      if (!inButton && !inDropdown) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", onOutside);
      const checkPosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const triggerW = dropdownMatchTriggerWidth
            ? Math.min(rect.width, window.innerWidth - rect.left - 8)
            : 208;
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          const threshold = showSearch ? 250 : 400;
          const shouldOpenUp = spaceBelow < threshold && spaceAbove > spaceBelow;
          setOpenUpward(shouldOpenUp);
          setDropdownStyle((prev) => {
            const next = { ...prev };
            if (shouldOpenUp) {
              next.bottom = `${window.innerHeight - rect.top + 4}px`;
              next.top = "auto";
              const wouldOverflowRight = rect.left + triggerW > window.innerWidth;
              if (wouldOverflowRight) {
                next.right = `${window.innerWidth - rect.right}px`;
                next.left = "auto";
              } else {
                next.left = `${rect.left}px`;
                next.right = "auto";
              }
            } else {
              next.top = `${rect.bottom + 4}px`;
              next.bottom = "auto";
              const wouldOverflowRight = rect.left + triggerW > window.innerWidth;
              if (wouldOverflowRight) {
                next.right = `${window.innerWidth - rect.right}px`;
                next.left = "auto";
              } else {
                next.left = `${rect.left}px`;
                next.right = "auto";
              }
            }
            const cap = showSearch ? 250 : 400;
            const maxH = shouldOpenUp
              ? Math.max(150, Math.min(cap, rect.top - 20))
              : Math.max(150, Math.min(cap, window.innerHeight - rect.bottom - 20));
            next.maxHeight = `${maxH}px`;
            const maxW =
              rect.left + triggerW > window.innerWidth
                ? Math.min(triggerW, window.innerWidth - rect.left - 8)
                : triggerW;
            next.maxWidth = `${maxW}px`;
            if (dropdownMatchTriggerWidth) {
              next.width = `${maxW}px`;
              next.minWidth = `${Math.min(rect.width, maxW)}px`;
            } else {
              delete next.width;
              delete next.minWidth;
            }
            return next;
          });
        }
      };
      window.addEventListener("scroll", checkPosition, true);
      window.addEventListener("resize", checkPosition);
      return () => {
        window.removeEventListener("scroll", checkPosition, true);
        window.removeEventListener("resize", checkPosition);
        document.removeEventListener("mousedown", onOutside);
      };
    }
  }, [open, dropdownMatchTriggerWidth, showSearch]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.trim().toLowerCase())
  );
  
  // For agent dropdown: if value exists but not in options, use fallbackLabel if provided
  // This handles cases where ticket assignee might not be in agentOptions
  const getDisplayLabel = () => {
    if (customDisplayLabel !== undefined) return customDisplayLabel;
    if (!value) return allowUnset ? unsetLabel : placeholder;
    
    const foundOption = options.find((o) => o.value === value);
    if (foundOption) return foundOption.label;
    
    // Use fallback label if provided (e.g. assignee name from ticket)
    if (fallbackLabel) return fallbackLabel;
    
    // Last resort: show the value itself (shouldn't happen if agentOptions is complete)
    return value;
  };
  
  const displayLabel = getDisplayLabel();

  const hasPosition = dropdownStyle.top !== undefined || dropdownStyle.bottom !== undefined;
  const dropdownContent =
    open &&
    typeof document !== "undefined" &&
    (() => {
      const content = (
        <div
          ref={dropdownRef}
          className={`fixed z-[9999] overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-xl shadow-slate-300/25 ring-1 ring-slate-900/5 ${
            dropdownMatchTriggerWidth ? "" : "w-52"
          }`}
          style={{
            ...dropdownStyle,
            ...(hasPosition ? {} : { opacity: 0, pointerEvents: "none" as const }),
          }}
        >
          {showSearch ? (
            <div className="border-b border-slate-100 bg-slate-50/80 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-8 pr-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
          ) : null}
          <div className="overflow-y-auto px-1.5 py-1.5" style={{ maxHeight: "inherit" }}>
            {allowUnset && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="mb-0.5 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 transition-colors hover:bg-slate-100"
              >
                {unsetLabel}
              </button>
            )}
            {filtered.map((opt) => {
              const isAssigned = assignedAgentId !== undefined && opt.value === String(assignedAgentId);
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 font-medium text-white shadow-md shadow-blue-600/20"
                      : "text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isAssigned && <span className={`ml-2 ${selected ? "text-white/80" : "text-slate-400"}`}>—</span>}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-center text-sm text-slate-500">No options</div>
            )}
          </div>
        </div>
      );
      return createPortal(content, document.body);
    })();

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`flex w-full min-w-0 items-center gap-0.5 rounded px-1 py-0.5 text-left text-xs text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 ${fullWidth ? "" : ""}`}
        style={{ border: "none", outline: "none", background: "transparent" }}
      >
        {leadingIcon && <span className="flex shrink-0 items-center">{leadingIcon}</span>}
        <span className="inline-flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
          <span className="min-w-0 truncate text-gray-800">{displayLabel}</span>
          <ChevronDown
            className={`h-3 w-3 shrink-0 text-gray-500 ${open ? "rotate-180" : ""} transition-transform duration-150`}
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </button>
      {dropdownContent}
    </div>
  );
}
