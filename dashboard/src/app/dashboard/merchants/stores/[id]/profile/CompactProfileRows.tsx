"use client";

import { Loader2 } from "lucide-react";

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
}: {
  label: string;
  value: string | number | string[] | undefined;
  isEditing: boolean;
  onEdit: () => void;
  onSave: () => void;
  /** Called when Cancel is clicked; use to revert draft. Then onSave is called to exit edit mode. */
  onCancel?: () => void;
  onChange: (value: string) => void;
  multiline?: boolean;
  /** When set, Save button persists to API; shows spinner while saving. */
  onSaveClick?: () => Promise<void>;
  saving?: boolean;
}) {
  const strValue = Array.isArray(value) ? value.join(", ") : (value ?? "");
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !multiline) (onSaveClick ? onSaveClick() : Promise.resolve()).then(() => onSave());
    if (e.key === "Escape") onSave();
  };

  const handleSaveBtn = () => {
    if (onSaveClick) {
      onSaveClick().then(() => onSave()).catch(() => {});
    } else {
      onSave();
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1 gap-2">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          {!isEditing ? (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 border border-blue-200"
              aria-label="Edit"
            >
              Edit
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onCancel?.();
                  onSave();
                }}
                className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBtn}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={12} className="animate-spin shrink-0" /> : null}
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>
      {isEditing ? (
        multiline ? (
          <textarea
            value={String(strValue)}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSaveClick ? undefined : onSave}
            onKeyDown={handleKeyDown}
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-900 bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            autoFocus
          />
        ) : (
          <input
            type="text"
            value={String(strValue)}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onSaveClick ? undefined : onSave}
            onKeyDown={handleKeyDown}
            className="w-full border border-blue-300 rounded px-2 py-1 text-sm text-gray-900 bg-white focus:ring-1 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        )
      ) : (
        <div className="text-sm text-gray-900 font-medium truncate">
          {strValue || <span className="text-gray-400">Not set</span>}
        </div>
      )}
    </div>
  );
}

export function CompactLockedRow({ label, value }: { label: string; value?: string | number | string[] | null }) {
  const str = Array.isArray(value) ? value.join(", ") : (value ?? "—");
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
      </div>
      <div className="text-sm text-gray-900 font-medium">{str || "—"}</div>
    </div>
  );
}
