"use client";

import { useState, useRef, useEffect } from "react";
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
}: InlineSearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener("mousedown", onOutside);
      // Check if dropdown should open upward
      const checkPosition = () => {
        if (buttonRef.current) {
          const rect = buttonRef.current.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          const dropdownHeight = 250; // Approximate max height including search bar
          // Open upward if there's not enough space below but more space above
          const shouldOpenUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
          setOpenUpward(shouldOpenUp);
        }
      };
      // Check immediately and on scroll/resize
      checkPosition();
      window.addEventListener('scroll', checkPosition, true);
      window.addEventListener('resize', checkPosition);
      return () => {
        window.removeEventListener('scroll', checkPosition, true);
        window.removeEventListener('resize', checkPosition);
      };
    }
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

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

  return (
    <div ref={ref} className={`relative ${className}`} style={{ zIndex: open ? 9999 : 'auto', isolation: 'isolate' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50 border-0 bg-transparent transition-colors w-full ${fullWidth ? "" : ""}`}
        style={{ border: 'none', outline: 'none' }}
      >
        {leadingIcon && <span className="shrink-0 flex items-center">{leadingIcon}</span>}
        <span className="whitespace-nowrap text-gray-800 truncate flex-1 min-w-0 text-left">{displayLabel}</span>
        <ChevronDown className="h-2.5 w-2.5 shrink-0 text-gray-500" />
      </button>
      {open && (
        <div 
          className={`fixed z-[9999] w-52 rounded-md border border-gray-200 bg-white shadow-lg ${
            openUpward ? '' : ''
          }`}
          style={{ 
            ...(() => {
              if (!buttonRef.current) return { left: '0', top: '0' };
              const buttonRect = buttonRef.current.getBoundingClientRect();
              const dropdownWidth = 208; // w-52 = 13rem = 208px
              
              // Check if dropdown would overflow on the right side of viewport
              const wouldOverflowRight = buttonRect.left + dropdownWidth > window.innerWidth;
              
              // Calculate position
              if (openUpward) {
                // Position above button using bottom
                const bottomPosition = window.innerHeight - buttonRect.top + 4; // 4px gap
                if (wouldOverflowRight) {
                  // Align dropdown to right edge of button
                  const rightPosition = window.innerWidth - buttonRect.right;
                  return { 
                    right: `${rightPosition}px`, 
                    left: 'auto',
                    bottom: `${bottomPosition}px`,
                    top: 'auto'
                  };
                }
                // Default: align to left edge of button
                return { 
                  left: `${buttonRect.left}px`, 
                  right: 'auto',
                  bottom: `${bottomPosition}px`,
                  top: 'auto'
                };
              } else {
                // Position below button using top
                const topPosition = buttonRect.bottom + 4; // 4px gap below
                if (wouldOverflowRight) {
                  // Align dropdown to right edge of button
                  const rightPosition = window.innerWidth - buttonRect.right;
                  return { 
                    right: `${rightPosition}px`, 
                    left: 'auto',
                    top: `${topPosition}px`,
                    bottom: 'auto'
                  };
                }
                // Default: align to left edge of button
                return { 
                  left: `${buttonRect.left}px`, 
                  right: 'auto',
                  top: `${topPosition}px`,
                  bottom: 'auto'
                };
              }
            })(),
            maxHeight: (() => {
              if (!buttonRef.current) return '200px';
              const rect = buttonRef.current.getBoundingClientRect();
              if (openUpward) {
                // Space above minus padding
                return `${Math.max(150, Math.min(250, rect.top - 20))}px`;
              } else {
                // Space below minus padding
                return `${Math.max(150, Math.min(250, window.innerHeight - rect.bottom - 20))}px`;
              }
            })(),
            // Ensure dropdown stays within viewport
            maxWidth: (() => {
              if (!buttonRef.current) return '208px';
              const rect = buttonRef.current.getBoundingClientRect();
              const wouldOverflowRight = rect.left + 208 > window.innerWidth;
              if (wouldOverflowRight) {
                // Limit width to available space
                return `${Math.min(208, window.innerWidth - rect.right)}px`;
              }
              return '208px';
            })(),
            overflowY: 'auto'
          }}
        >
          <div className="border-b border-gray-100 p-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded border border-gray-200 py-1.5 pl-7 pr-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="overflow-y-auto py-1" style={{ maxHeight: 'inherit' }}>
            {allowUnset && (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-100"
              >
                {unsetLabel}
              </button>
            )}
            {filtered.map((opt) => {
              const isAssigned = assignedAgentId !== undefined && opt.value === String(assignedAgentId);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-xs hover:bg-gray-100 flex items-center justify-between ${
                    opt.value === value ? "bg-blue-50 text-blue-800 font-medium" : "text-gray-800"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isAssigned && (
                    <span className="text-gray-500 ml-2">—</span>
                  )}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-gray-500">No options</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
