"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

export type SearchableSelectOption = { value: string; label: string };

export function SearchableSelect({
  value,
  options,
  placeholder,
  onChange,
  searchPlaceholder = "Search",
  emptyText = "No matches",
  triggerClassName,
}: {
  value: string;
  options: SearchableSelectOption[];
  placeholder: string;
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  triggerClassName: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, query]);

  const placeMenu = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const top = r.bottom + 4;
    setPos({
      top,
      left: r.left,
      width: r.width,
      maxHeight: Math.max(160, Math.min(280, window.innerHeight - top - 12)),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
    const onReposition = () => placeMenu();
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="relative">
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`${triggerClassName} pr-9 text-left ${
            value ? "text-slate-800" : "text-slate-400"
          }`}
        >
          {selected?.label ?? placeholder}
        </button>
        <ChevronDown
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </div>
      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                width: Math.max(pos.width, 220),
                zIndex: 90,
              }}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            >
              <div className="border-b border-slate-100 p-1.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder={searchPlaceholder}
                    className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white"
                  />
                </div>
              </div>
              <div
                className="overflow-y-auto overscroll-contain py-1"
                style={{ maxHeight: pos.maxHeight }}
              >
                {filtered.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">{emptyText}</p>
                ) : (
                  filtered.map((opt) => {
                    const active = opt.value === value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                        }}
                        className={`flex w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                          active ? "bg-indigo-50 font-medium text-indigo-700" : "text-slate-800"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
