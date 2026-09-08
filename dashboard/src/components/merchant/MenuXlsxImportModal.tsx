"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { Download, FileSpreadsheet, Trash2, Upload, X } from "lucide-react";
import {
  downloadMenuXlsxTemplate,
  parseMenuXlsxFile,
  parsedWorkbookHasErrors,
  removeParsedPreviewRow,
  toBulkImportPayload,
  type ParsedMenuWorkbook,
  type ParsedPreviewKind,
} from "@/lib/menu-xlsx-import";
import type { MenuCategory } from "@/app/dashboard/merchants/stores/[id]/menu/menu-types";
import { MenuFormZipSlider } from "@/app/dashboard/merchants/stores/[id]/menu/MenuFormZipSlider";

const SPREADSHEET_EXT = [".xlsx", ".xls", ".csv"];

function isSpreadsheetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (SPREADSHEET_EXT.some((ext) => name.endsWith(ext))) return true;
  const type = (file.type || "").toLowerCase();
  return (
    type.includes("spreadsheet") ||
    type.includes("excel") ||
    type === "text/csv" ||
    type === "application/vnd.ms-excel" ||
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
}

type Props = {
  open: boolean;
  storeId: string;
  categories: MenuCategory[];
  existingItems?: { id: number; item_name: string; category_name?: string | null }[];
  itemFormVariant: "grocery" | "standard";
  showCuisineField?: boolean;
  storeTypeLabel?: string;
  defaultPrepMinutes?: number | null;
  onClose: () => void;
  onImported: () => Promise<void> | void;
  toast: (message: string, variant?: "success" | "error" | "info") => void;
};

export function MenuXlsxImportModal({
  open,
  storeId,
  categories,
  existingItems = [],
  itemFormVariant,
  showCuisineField = false,
  storeTypeLabel,
  defaultPrepMinutes,
  onClose,
  onImported,
  toast,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedMenuWorkbook | null>(null);
  const [parseError, setParseError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const hasErrors = parsed ? parsedWorkbookHasErrors(parsed) : true;
  const hasAnythingToUpload = Boolean(
    parsed &&
      (parsed.items.length > 0 ||
        parsed.categories.some((c) => c.will_create) ||
        parsed.variants.length > 0 ||
        parsed.customizations.length > 0 ||
        parsed.addons.length > 0)
  );
  const existingCategories = useMemo(
    () =>
      categories.map((c) => ({
        id: c.id,
        category_name: c.category_name,
        parent_category_id: c.parent_category_id ?? null,
      })),
    [categories]
  );

  const reset = () => {
    setFileName("");
    setParsed(null);
    setParseError("");
    setUploadError("");
    setDragActive(false);
    dragDepthRef.current = 0;
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploading) return;
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const onDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setDragActive(false);
    }
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = uploading ? "none" : "copy";
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    if (uploading) return;
    const file = e.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    if (!isSpreadsheetFile(file)) {
      setParseError("Please drop an .xlsx, .xls, or .csv file.");
      setParsed(null);
      setFileName("");
      return;
    }
    void handleFile(file);
  };

  const handleRemoveRow = (kind: ParsedPreviewKind, index: number) => {
    if (uploading || !parsed) return;
    setParsed(removeParsedPreviewRow(parsed, kind, index));
  };

  const handleClose = () => {
    if (uploading) return;
    reset();
    onClose();
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setParseError("");
    setUploadError("");
    setFileName(file.name);
    try {
      const next = await parseMenuXlsxFile(file, {
        existingCategories,
        existingItems,
        itemFormVariant,
        defaultPrepMinutes,
      });
      setParsed(next);
    } catch (e) {
      setParsed(null);
      setParseError(e instanceof Error ? e.message : "Could not read this Excel file.");
    }
  };

  const handleUpload = async () => {
    if (!parsed || hasErrors || !hasAnythingToUpload) return;
    setUploading(true);
    setUploadError("");
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/menu/bulk-import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBulkImportPayload(parsed)),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(typeof json?.error === "string" ? json.error : "Upload failed");
      }
      const createdItems = Number(json?.created?.items ?? 0);
      const filledItems = Number(json?.created?.itemsFilled ?? 0);
      const createdCats = Number(json?.created?.categories ?? 0);
      const parts: string[] = [];
      if (createdItems > 0) parts.push(`Added ${createdItems} item${createdItems === 1 ? "" : "s"}`);
      if (filledItems > 0) {
        parts.push(`replaced ${filledItems} existing item${filledItems === 1 ? "" : "s"}`);
      }
      if (createdCats > 0) {
        parts.push(`created ${createdCats} categor${createdCats === 1 ? "y" : "ies"}`);
      }
      toast(
        parts.length > 0
          ? `${parts.join(", ")}. Same-name items were not duplicated.`
          : "No duplicates added. Existing items were replaced.",
        "success"
      );
      await onImported();
      reset();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setUploadError(msg);
      toast(msg, "error");
    } finally {
      setUploading(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  const isGrocery = itemFormVariant === "grocery";
  const zipResetKey = parsed
    ? `${fileName}-${parsed.items.length}-${parsed.categories.length}-${parsed.variants.length}-${parsed.customizations.length}-${parsed.addons.length}`
    : fileName || "empty";
  const previewSections: {
    title: string;
    kind: ParsedPreviewKind;
    headers: string[];
    rows: { key: string; index: number; error?: string; cells: string[] }[];
  }[] = parsed
    ? [
        {
          title: "Categories",
          kind: "categories",
          rows: parsed.categories.map((c, index) => ({
            key: `c-${index}-${c.row}-${c.category_name}`,
            index,
            error: c.errors[0],
            cells: [
              c.will_create ? "Create" : "Existing",
              c.category_name,
              c.parent_category_name || "—",
              ...(showCuisineField && !isGrocery ? [c.cuisine || "—"] : []),
            ],
          })),
          headers: [
            "Action",
            "Category",
            "Parent",
            ...(showCuisineField && !isGrocery ? ["Cuisine"] : []),
          ],
        },
        {
          title: "Menu items",
          kind: "items",
          rows: parsed.items.map((it, index) => ({
            key: `i-${index}-${it.row}-${it.item_name}`,
            index,
            error: it.errors[0],
            cells: isGrocery
              ? [
                  it.will_create ? "Create" : "Replace",
                  it.item_name,
                  it.category_name,
                  it.expiry_date || "—",
                  String(it.base_price),
                  String(it.selling_price),
                  it.in_stock ? "In stock" : "Out",
                ]
              : [
                  it.will_create ? "Create" : "Replace",
                  it.item_name,
                  it.category_name,
                  it.food_type || "—",
                  it.spice_level || "—",
                  ...(showCuisineField ? [it.cuisine_type || "—"] : []),
                  String(it.base_price),
                  String(it.selling_price),
                  it.in_stock ? "In stock" : "Out",
                ],
          })),
          headers: isGrocery
            ? ["Action", "Item", "Category", "Expiry", "Base ₹", "Sell ₹", "Stock"]
            : [
                "Action",
                "Item",
                "Category",
                "Food type",
                "Spice",
                ...(showCuisineField ? ["Cuisine"] : []),
                "Base ₹",
                "Sell ₹",
                "Stock",
              ],
        },
        {
          title: "Variants",
          kind: "variants",
          rows: parsed.variants.map((v, index) => ({
            key: `v-${index}-${v.row}-${v.variant_name}`,
            index,
            error: v.errors[0],
            cells: [v.item_name, v.variant_name, v.variant_type || "—", String(v.variant_price)],
          })),
          headers: ["Item", "Variant", "Type", "Price ₹"],
        },
        {
          title: "Customizations",
          kind: "customizations",
          rows: parsed.customizations.map((c, index) => ({
            key: `g-${index}-${c.row}-${c.customization_title}`,
            index,
            error: c.errors[0],
            cells: [c.item_name, c.customization_title, c.customization_type || "—", c.is_required ? "Required" : "Optional"],
          })),
          headers: ["Item", "Group", "Type", "Required"],
        },
        {
          title: "Customization options",
          kind: "addons",
          rows: parsed.addons.map((a, index) => ({
            key: `a-${index}-${a.row}-${a.addon_name}`,
            index,
            error: a.errors[0],
            cells: [a.item_name, a.customization_title, a.addon_name, String(a.addon_price)],
          })),
          headers: ["Item", "Group", "Option", "Price ₹"],
        },
      ]
    : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-md p-3"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">Add menu items from XLSX</h2>
            <p className="text-xs text-gray-500">
              Template matches this store type
              {storeTypeLabel ? ` (${storeTypeLabel})` : ""} — same fields as Add Menu Item.
            </p>
          </div>
          <button type="button" onClick={handleClose} className="p-1.5 hover:bg-gray-100 rounded-lg" aria-label="Close">
            <X size={18} className="text-gray-600" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
        <div
          ref={scrollRef}
          className={`flex-1 min-h-0 overflow-y-auto menu-item-form-zip-scroll px-4 py-3 space-y-4 ${
            dragActive && parsed ? "ring-2 ring-inset ring-orange-400 bg-orange-50/30" : ""
          }`}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                void downloadMenuXlsxTemplate({
                  itemFormVariant,
                  showCuisineField,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
            >
              <Download size={15} />
              Download template
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-gray-900 text-white hover:bg-gray-800"
            >
              <FileSpreadsheet size={15} />
              Choose XLSX
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            {fileName ? <span className="text-xs text-gray-600 truncate max-w-[240px]">{fileName}</span> : null}
          </div>

          <p className="text-xs text-gray-500">
            {isGrocery
              ? "Grocery template columns match the Add Item form: name, category, prices, stock, expiry, size, and delivery. Variants and customizations are optional extra sheets."
              : "Restaurant template columns match the Add Item form: name, category, food type, spice, prices, stock, and optional cuisine. Variants and customizations are optional extra sheets."}{" "}
            Category names on Items are created automatically if they do not exist yet.
            Existing items and categories are not duplicated — missing fields are filled from Excel.
          </p>

          {parseError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{parseError}</div>
          ) : null}

          {parsed ? (
            <>
              {parsed.workbookErrors.length > 0 ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 space-y-1">
                  {parsed.workbookErrors.map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                </div>
              ) : null}

              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Field mapping</h3>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Sheet</th>
                        <th className="text-left px-3 py-2 font-semibold">Excel column</th>
                        <th className="text-left px-3 py-2 font-semibold">Goes into</th>
                        <th className="text-left px-3 py-2 font-semibold">Sample</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.fieldMappings.map((m, i) => (
                        <tr key={`${m.sheet}-${m.excelHeader}-${i}`} className="border-t border-gray-100">
                          <td className="px-3 py-1.5 text-gray-500">{m.sheet}</td>
                          <td className="px-3 py-1.5 font-medium text-gray-800">{m.excelHeader}</td>
                          <td className="px-3 py-1.5 text-gray-900">
                            {m.dbLabel} <span className="text-gray-400">({m.dbField})</span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-600 truncate max-w-[180px]">{m.sample || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsed.unmatchedHeaders.length > 0 ? (
                  <p className="mt-2 text-xs text-amber-700">
                    Ignored columns: {parsed.unmatchedHeaders.map((h) => `${h.sheet} → ${h.excelHeader}`).join(", ")}
                  </p>
                ) : null}
              </section>

              <p className="text-xs text-gray-500">
                Remove drops that row from this upload only. Removing an item also removes its variants and customizations.
              </p>
              {previewSections
                .filter((s) => s.rows.length > 0)
                .map((section) => (
                  <section key={section.title}>
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">
                      {section.title} ({section.rows.length})
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="min-w-full text-xs">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            {section.headers.map((h) => (
                              <th key={h} className="text-left px-3 py-2 font-semibold whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                            <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Status</th>
                            <th className="text-right px-2 py-2 font-semibold whitespace-nowrap sticky right-0 bg-gray-50">
                              Remove
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {section.rows.map((row) => (
                            <tr key={row.key} className="border-t border-gray-100">
                              {row.cells.map((cell, i) => (
                                <td key={i} className="px-3 py-1.5 text-gray-800 whitespace-nowrap">
                                  {cell}
                                </td>
                              ))}
                              <td className={`px-3 py-1.5 whitespace-nowrap ${row.error ? "text-red-600" : "text-emerald-700"}`}>
                                {row.error || "Ready"}
                              </td>
                              <td className="px-2 py-1 text-right whitespace-nowrap sticky right-0 bg-white">
                                <button
                                  type="button"
                                  disabled={uploading}
                                  onClick={() => handleRemoveRow(section.kind, row.index)}
                                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                  aria-label={`Remove ${row.cells[1] || row.cells[0] || "row"}`}
                                  title="Remove from this upload"
                                >
                                  <Trash2 size={14} />
                                  <span className="font-semibold">Remove</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
            </>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Drag and drop an XLSX file, or click to choose"
              onClick={() => {
                if (!uploading) fileInputRef.current?.click();
              }}
              onKeyDown={(e) => {
                if (uploading) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`w-full rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors ${
                dragActive
                  ? "border-orange-500 bg-orange-50 text-orange-800"
                  : "border-gray-300 bg-gray-50/60 text-gray-500 hover:border-orange-300 hover:bg-orange-50/40"
              } ${uploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <FileSpreadsheet
                size={28}
                className={`mx-auto mb-2 ${dragActive ? "text-orange-600" : "text-gray-400"}`}
              />
              <p className="text-sm font-medium text-gray-700">
                {dragActive ? "Drop XLSX here" : "Drag and drop an XLSX file here"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                or click to choose a file. Preview shows which data will go into each menu field.
              </p>
            </div>
          )}

          {uploadError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{uploadError}</div>
          ) : null}
        </div>
        <MenuFormZipSlider scrollRef={scrollRef} resetKey={zipResetKey} />
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={!parsed || hasErrors || uploading || !hasAnythingToUpload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={15} />
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
