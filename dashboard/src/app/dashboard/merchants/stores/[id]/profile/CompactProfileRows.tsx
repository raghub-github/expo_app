"use client";

import { Edit2, Loader2 } from "lucide-react";

/** Matches partnersite profile CompactEditableRow / CompactLockedRow. */
export function CompactEditableRow({
  label,
  value,
  isEditing,
  onEdit,
  onSave,
  onCancel,
  onChange,
  multiline = false,
  onSaveClick,
  saving = false,
  dense = false,
}: {
  label: string;
  value: string | number | string[] | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  onCancel?: () => void;
  onChange: (value: string) => void;
  multiline?: boolean;
  onSaveClick?: () => Promise<void>;
  saving?: boolean;
  dense?: boolean;
}) {
  const strValue = Array.isArray(value) ? value.join(", ") : (value ?? "");

  const handleCommit = async () => {
    if (saving) return;
    if (onSaveClick) {
      await onSaveClick();
      onSave();
      return;
    }
    onSave();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      void handleCommit();
    }
    if (e.key === "Escape") {
      (onCancel ?? onSave)();
    }
  };

  const blurHandler = onSaveClick ? undefined : onSave;
  const labelCls = dense ? "text-[10px] font-medium text-gray-600" : "text-xs font-medium text-gray-600";
  const valCls = dense ? "text-xs text-gray-900 font-medium" : "text-sm text-gray-900 font-medium";
  const fieldPad = dense ? "px-2 py-0.5 text-xs" : "px-2 py-1 text-sm";

  return (
    <div className="group min-w-0">
      <div className={`flex items-center justify-between ${dense ? "mb-0.5" : "mb-1"}`}>
        <span className={labelCls}>{label}</span>
        {!isEditing ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-blue-600 hover:text-blue-800 opacity-0 group-hover:opacity-100 transition-all"
            aria-label={`Edit ${label}`}
          >
            <Edit2 size={12} />
          </button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="text-xs text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleCommit()}
              disabled={saving}
              className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 text-xs font-semibold disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin shrink-0" /> : null}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>
      {isEditing ? (
        multiline ? (
          <textarea
            value={String(strValue)}
            onChange={(e) => onChange(e.target.value)}
            onBlur={blurHandler}
            onKeyDown={handleKeyDown}
            className={`w-full border border-blue-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent text-gray-900 ${fieldPad}`}
            rows={2}
            autoFocus
            disabled={saving}
          />
        ) : (
          <input
            type="text"
            value={String(strValue)}
            onChange={(e) => onChange(e.target.value)}
            onBlur={blurHandler}
            onKeyDown={handleKeyDown}
            className={`w-full border border-blue-300 rounded bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent text-gray-900 ${fieldPad}`}
            autoFocus
            disabled={saving}
          />
        )
      ) : (
        <div
          className={`${valCls} ${
            multiline && dense ? "line-clamp-2 whitespace-normal break-words" : "truncate"
          }`}
        >
          {strValue !== "" ? (
            String(strValue)
          ) : (
            <span className="text-gray-400">Not set</span>
          )}
        </div>
      )}
    </div>
  );
}

export function CompactLockedRow({
  label,
  value,
  dense = false,
}: {
  label: string;
  value?: string | number | string[] | null;
  dense?: boolean;
}) {
  const str = Array.isArray(value) ? value.join(", ") : (value ?? "");
  const labelCls = dense ? "text-[10px] font-medium text-gray-600" : "text-xs font-medium text-gray-600";
  const valCls = dense ? "text-xs text-gray-900 font-medium" : "text-sm text-gray-900 font-medium";

  return (
    <div className="min-w-0">
      <div className={`flex items-center justify-between ${dense ? "mb-0.5" : "mb-1"}`}>
        <span className={labelCls}>{label}</span>
        <span className="text-[10px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded shrink-0">Read Only</span>
      </div>
      <div className={`${valCls} break-words`}>{str || <span className="text-gray-400">—</span>}</div>
    </div>
  );
}
