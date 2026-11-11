"use client";

import { memo, useCallback, useMemo } from "react";
import { FixedSizeList, type ListChildComponentProps } from "react-window";
import { ImageIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import type { UserAppCategoryRow } from "@/lib/user-app-categories/shared";
import { LazyThumb } from "@/components/ui/LazyThumb";

const ROW_H = 52;
const VIRTUALIZE_AFTER = 16;
const COLS =
  "grid grid-cols-[8%_26%_13%_14%_12%_27%] items-center gap-x-4 min-w-[720px] w-full";

type Props = {
  rows: UserAppCategoryRow[];
  rowBusyId: number | null;
  quickRowId: number | null;
  listFetching?: boolean;
  onQuickImage: (row: UserAppCategoryRow, file: File | null) => void;
  onCommitOrder: (
    row: UserAppCategoryRow,
    nextOrder: number,
    input: HTMLInputElement
  ) => void;
  onToggleStatus: (row: UserAppCategoryRow) => void;
  onEdit: (row: UserAppCategoryRow) => void;
  onRemove: (row: UserAppCategoryRow) => void;
};

type RowData = {
  rows: UserAppCategoryRow[];
  rowBusyId: number | null;
  quickRowId: number | null;
  onQuickImage: Props["onQuickImage"];
  onCommitOrder: Props["onCommitOrder"];
  onToggleStatus: Props["onToggleStatus"];
  onEdit: Props["onEdit"];
  onRemove: Props["onRemove"];
};

const CategoryRow = memo(function CategoryRow({
  index,
  style,
  data,
}: ListChildComponentProps<RowData>) {
  const row = data.rows[index];
  if (!row) return null;
  const busy = data.rowBusyId === row.id;
  const imgBusy = data.quickRowId === row.id;
  const isInactive = row.status === "inactive";
  const stripe = !isInactive && index % 2 === 1;

  return (
    <div
      style={style}
      className={`${COLS} border-b border-gray-100 px-0 ${
        isInactive
          ? "bg-gray-50/90 text-gray-600"
          : stripe
            ? "bg-gray-50/70"
            : "bg-white"
      } hover:bg-cyan-50/60`}
      role="row"
    >
      <div className="pl-3 pr-3 text-center" role="cell">
        <input
          id={`uac-thumb-${row.id}`}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          disabled={imgBusy || busy}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            data.onQuickImage(row, f);
            e.target.value = "";
          }}
        />
        <label
          htmlFor={`uac-thumb-${row.id}`}
          className={`relative inline-flex cursor-pointer rounded-full ${
            imgBusy ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {row.image_url ? (
            <span className="relative inline-block">
              <LazyThumb
                src={row.image_url}
                priority={index < 2}
                className={`h-8 w-8 rounded-full object-cover border border-gray-200/60 ${
                  imgBusy ? "opacity-50" : ""
                } ${isInactive ? "grayscale-[0.35] opacity-90" : ""}`}
              />
              {imgBusy ? (
                <span className="absolute inset-0 flex items-center justify-center rounded-full">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-600" />
                </span>
              ) : null}
            </span>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-400">
              {imgBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
            </div>
          )}
        </label>
      </div>

      <div className="px-3 text-center" role="cell">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <span
            className={`font-medium text-xs break-words [overflow-wrap:anywhere] ${
              isInactive ? "text-gray-600" : "text-gray-900"
            }`}
          >
            {row.name}
          </span>
          {isInactive ? (
            <span className="inline-flex shrink-0 rounded-full border border-gray-300/80 bg-gray-200 px-1.5 py-px text-[10px] font-medium text-gray-700">
              Inactive
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-3 text-center" role="cell">
        <input
          key={`${row.id}-${row.display_order}`}
          type="number"
          step={1}
          defaultValue={row.display_order}
          disabled={busy}
          title="Edit order — another tile with this order swaps places"
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          onBlur={(e) => {
            const raw = e.target.value.trim();
            const v = parseInt(raw, 10);
            if (raw === "" || !Number.isFinite(v)) {
              e.target.value = String(row.display_order);
              return;
            }
            data.onCommitOrder(row, v, e.target);
          }}
          className="mx-auto block w-[4.25rem] max-w-full rounded border border-gray-300 bg-white px-1.5 py-1 text-center text-[11px] tabular-nums text-gray-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
        />
      </div>

      <div className="px-3 text-center" role="cell">
        <span className="inline-flex items-center justify-center rounded border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
          {row.store_type}
        </span>
      </div>

      <div className="px-3 text-center" role="cell">
        <button
          type="button"
          role="switch"
          aria-checked={row.status === "active"}
          disabled={busy}
          onClick={() => data.onToggleStatus(row)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 disabled:opacity-50 ${
            row.status === "active" ? "bg-emerald-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`pointer-events-none mt-0.5 ml-0.5 inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
              row.status === "active" ? "translate-x-3.5" : "translate-x-0"
            }`}
          />
          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/40">
              <Loader2 className="h-3 w-3 animate-spin text-gray-600" />
            </span>
          ) : null}
        </button>
      </div>

      <div className="pl-3 pr-3 text-right" role="cell">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => data.onEdit(row)}
            disabled={busy}
            className="inline-flex items-center gap-0.5 rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-medium text-cyan-800 hover:bg-cyan-100 disabled:opacity-50"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => data.onRemove(row)}
            disabled={busy}
            className="inline-flex items-center gap-0.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 className="h-3 w-3" />
            Remove
          </button>
        </div>
      </div>
    </div>
  );
});

export function CategoriesVirtualTable({
  rows,
  rowBusyId,
  quickRowId,
  listFetching,
  onQuickImage,
  onCommitOrder,
  onToggleStatus,
  onEdit,
  onRemove,
}: Props) {
  const itemData = useMemo<RowData>(
    () => ({
      rows,
      rowBusyId,
      quickRowId,
      onQuickImage,
      onCommitOrder,
      onToggleStatus,
      onEdit,
      onRemove,
    }),
    [rows, rowBusyId, quickRowId, onQuickImage, onCommitOrder, onToggleStatus, onEdit, onRemove]
  );

  const useVirtual = rows.length >= VIRTUALIZE_AFTER;
  const listHeight = Math.min(520, Math.max(ROW_H * 6, rows.length * ROW_H));

  const renderStatic = useCallback(() => {
    return rows.map((_, index) => (
      <CategoryRow
        key={rows[index].id}
        index={index}
        style={{ height: ROW_H }}
        data={itemData}
      />
    ));
  }, [rows, itemData]);

  return (
    <div className="relative w-full overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      {listFetching ? (
        <div className="absolute right-2 top-2 z-10">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
        </div>
      ) : null}

      <div
        className={`${COLS} sticky top-0 z-10 border-b border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-600`}
        role="row"
      >
        <div className="py-2.5 pl-3 pr-3 text-center">Image</div>
        <div className="px-3 py-2.5 text-center">Name</div>
        <div className="px-3 py-2.5 text-center tabular-nums">Order</div>
        <div className="px-3 py-2.5 text-center">Store</div>
        <div className="px-3 py-2.5 text-center">Active</div>
        <div className="py-2.5 pl-3 pr-3 text-right">Actions</div>
      </div>

      {useVirtual ? (
        <FixedSizeList
          height={listHeight}
          width="100%"
          itemCount={rows.length}
          itemSize={ROW_H}
          itemData={itemData}
          itemKey={(index, data) => data.rows[index]?.id ?? index}
          overscanCount={6}
        >
          {CategoryRow}
        </FixedSizeList>
      ) : (
        <div role="rowgroup">{renderStatic()}</div>
      )}
    </div>
  );
}
