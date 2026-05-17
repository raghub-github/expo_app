"use client";

import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import type { MenuOosChoice, MenuOosModal } from "@/lib/merchant-menu-stock";

const SHEET_SCOPED_STYLES = `
  .menu-oos-sheet-root,
  .menu-oos-sheet-root * {
    color-scheme: light;
  }
  .menu-oos-sheet-root button:not(.menu-oos-btn-confirm) {
    color: rgb(17 24 39);
  }
  .menu-oos-sheet-root input[type="radio"] {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
    accent-color: rgb(249 115 22);
    cursor: pointer;
  }
  .menu-oos-sheet-root input[type="date"],
  .menu-oos-sheet-root input[type="time"] {
    color: rgb(17 24 39) !important;
    border-color: rgb(209 213 219);
    background-color: #fff;
  }
`;

export type MenuOutOfStockSheetProps = {
  modal: MenuOosModal | null;
  sheetShown: boolean;
  busy: boolean;
  choice: MenuOosChoice;
  hours: number;
  date: string;
  time: string;
  onClose: () => void;
  onConfirm: () => void;
  onChoiceChange: (choice: MenuOosChoice) => void;
  onHoursChange: (hours: number) => void;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  onCustomTouched: () => void;
};

const radioCls = "h-4 w-4 shrink-0 accent-orange-500 cursor-pointer disabled:opacity-50";
const stepBtnCls =
  "inline-flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-900 shadow-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40";
const fieldCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-900 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-50";

export function MenuOutOfStockSheet({
  modal,
  sheetShown,
  busy,
  choice,
  hours,
  date,
  time,
  onClose,
  onConfirm,
  onChoiceChange,
  onHoursChange,
  onDateChange,
  onTimeChange,
  onCustomTouched,
}: MenuOutOfStockSheetProps) {
  if (!modal || typeof document === "undefined") return null;

  const title =
    modal.kind === "category"
      ? "Mark Category out of stock"
      : modal.kind === "combo"
        ? "Mark combo out of stock"
        : "Mark item out of stock";

  const subtitle =
    modal.kind === "category"
      ? modal.categoryName
      : modal.kind === "combo"
        ? modal.comboName
        : modal.item_name;

  return createPortal(
    <div className="menu-oos-sheet-root fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm text-gray-900">
      <style>{SHEET_SCOPED_STYLES}</style>
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default !text-transparent"
        aria-label="Close"
        onClick={() => (!busy ? onClose() : undefined)}
        disabled={busy}
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white text-gray-900 shadow-2xl transition-transform duration-250 ease-out ${
          sheetShown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ colorScheme: "light" }}
      >
        <div className="border-b border-gray-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <p className="truncate text-sm font-medium text-gray-700">{subtitle}</p>
              {modal.kind === "category" ? (
                <p className="mt-2 text-xs leading-5 text-gray-600">
                  If you mark this category as out of stock, all items under this category will automatically be
                  marked as out of stock. When the category is marked back in stock, all items will be restored
                  automatically.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => (!busy ? onClose() : undefined)}
              className="rounded-lg p-2 text-gray-700 hover:bg-gray-100"
              aria-label="Close"
              disabled={busy}
            >
              <X size={20} strokeWidth={2.25} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="overflow-hidden rounded-xl border border-gray-300 bg-white shadow-sm">
            <div className="border-b border-gray-200 bg-white px-4 py-3.5 hover:bg-gray-50">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2.5">
                  <input
                    type="radio"
                    name="oos"
                    className={radioCls}
                    checked={choice === "HOURS"}
                    onChange={() => onChoiceChange("HOURS")}
                    disabled={busy}
                  />
                  <span className="text-sm font-semibold text-gray-900">For specific time</span>
                </span>
                <span
                  className={`flex shrink-0 items-center gap-2 ${choice !== "HOURS" ? "pointer-events-none opacity-45" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => onHoursChange(Math.max(1, hours - 1))}
                    className={stepBtnCls}
                    disabled={busy || choice !== "HOURS"}
                    aria-label="Decrease hours"
                  >
                    <Minus size={16} strokeWidth={2.5} />
                  </button>
                  <span className="min-w-[4.5rem] text-center text-sm font-bold text-gray-900">
                    {hours} hour{hours === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => onHoursChange(Math.min(24 * 14, hours + 1))}
                    className={stepBtnCls}
                    disabled={busy || choice !== "HOURS"}
                    aria-label="Increase hours"
                  >
                    <Plus size={16} strokeWidth={2.5} />
                  </button>
                </span>
              </label>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-3.5 hover:bg-gray-50">
              <input
                type="radio"
                name="oos"
                className={radioCls}
                checked={choice === "NEXT_OPEN"}
                onChange={() => onChoiceChange("NEXT_OPEN")}
                disabled={busy}
              />
              <span className="text-sm font-semibold text-gray-900">Next business day · Opening time</span>
            </label>

            <label className="flex cursor-pointer items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-3.5 hover:bg-gray-50">
              <input
                type="radio"
                name="oos"
                className={radioCls}
                checked={choice === "CUSTOM"}
                onChange={() => onChoiceChange("CUSTOM")}
                disabled={busy}
              />
              <span className="text-sm font-semibold text-gray-900">Custom date &amp; time</span>
            </label>
            <div className={`border-b border-gray-200 bg-white px-4 pb-4 ${choice !== "CUSTOM" ? "opacity-55" : ""}`}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-700">Date</label>
                  <input
                    type="date"
                    value={date}
                    onMouseDown={() => {
                      onCustomTouched();
                      onChoiceChange("CUSTOM");
                    }}
                    onFocus={() => {
                      onCustomTouched();
                      onChoiceChange("CUSTOM");
                    }}
                    onChange={(e) => {
                      onCustomTouched();
                      onChoiceChange("CUSTOM");
                      onDateChange(e.target.value);
                    }}
                    className={fieldCls}
                    disabled={busy}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-700">Time</label>
                  <input
                    type="time"
                    value={time}
                    onMouseDown={() => {
                      onCustomTouched();
                      onChoiceChange("CUSTOM");
                    }}
                    onFocus={() => {
                      onCustomTouched();
                      onChoiceChange("CUSTOM");
                    }}
                    onChange={(e) => {
                      onCustomTouched();
                      onChoiceChange("CUSTOM");
                      onTimeChange(e.target.value);
                    }}
                    className={fieldCls}
                    disabled={busy}
                  />
                </div>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 bg-white px-4 py-3.5 hover:bg-gray-50">
              <input
                type="radio"
                name="oos"
                className={`${radioCls} mt-0.5`}
                checked={choice === "MANUAL"}
                onChange={() => onChoiceChange("MANUAL")}
                disabled={busy}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">I will turn it on manually</span>
                <span className="mt-1 block text-xs leading-relaxed text-gray-600">
                  Item won&apos;t be visible to customers until you mark it back in stock
                </span>
              </span>
            </label>
          </div>
        </div>

        <div className="flex gap-3 border-t border-gray-200 bg-white p-5">
          <button
            type="button"
            onClick={() => (!busy ? onClose() : undefined)}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-50"
            disabled={busy}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="menu-oos-btn-confirm flex-1 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold !text-white shadow-sm transition-all hover:bg-orange-600 disabled:opacity-60"
            disabled={busy}
          >
            {busy ? "Updating..." : "Confirm"}
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
