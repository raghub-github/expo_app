"use client";

import { SIZE_UNITS } from "./menu-types";
import {
  parseSizePreset,
  sizeModeFromPreset,
  type SizeMode,
  type SizePreset,
} from "@/lib/menu-size-preset";

const SIZE_TYPE_OPTIONS: { value: SizeMode; label: string }[] = [
  { value: "MANUAL", label: "Manual" },
  { value: "REGULAR", label: "Regular" },
  { value: "STANDARD", label: "Standard" },
  { value: "PREMIUM", label: "Premium" },
];

type Props = {
  sizePreset: SizePreset | null | undefined;
  sizeValue: string;
  sizeUnit: string;
  onChange: (next: { size_preset: SizePreset | null; size_value: string; size_unit: string }) => void;
  sizeInputType?: "number" | "text";
  sizePlaceholder?: string;
  compact?: boolean;
};

export function SizeTypeFields({
  sizePreset,
  sizeValue,
  sizeUnit,
  onChange,
  sizeInputType = "number",
  sizePlaceholder = "e.g. 500",
  compact = false,
}: Props) {
  const mode = sizeModeFromPreset(sizePreset);
  const isManual = mode === "MANUAL";
  const labelClass = compact
    ? "text-[10px] text-gray-600 block mb-0.5 whitespace-nowrap"
    : "text-xs font-medium text-gray-600 block mb-0.5 whitespace-nowrap";
  const controlClass = compact
    ? "w-full px-1.5 py-1 border border-gray-200 rounded text-xs"
    : "w-full px-2.5 py-1.5 border border-gray-200 rounded text-sm";

  return (
    <div className="flex flex-nowrap items-end gap-2 shrink-0">
      <div className={compact ? "w-[100px] shrink-0" : "w-[128px] shrink-0"}>
        <label className={labelClass}>Size type</label>
        <select
          className={controlClass}
          value={mode}
          onChange={(e) => {
            const next = e.target.value as SizeMode;
            if (next === "MANUAL") {
              onChange({ size_preset: null, size_value: sizeValue, size_unit: sizeUnit });
              return;
            }
            onChange({ size_preset: next, size_value: "", size_unit: "" });
          }}
        >
          {SIZE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {isManual ? (
        <>
          <div className={compact ? "w-[76px] shrink-0" : "w-[100px] shrink-0"}>
            <label className={labelClass}>{compact ? "Size (optional)" : "Item size"}</label>
            <input
              type={sizeInputType}
              min={sizeInputType === "number" ? 0 : undefined}
              className={controlClass}
              value={sizeValue}
              onChange={(e) =>
                onChange({
                  size_preset: parseSizePreset(sizePreset),
                  size_value: e.target.value,
                  size_unit: sizeUnit,
                })
              }
              placeholder={sizePlaceholder}
            />
          </div>
          <div className={compact ? "w-[88px] shrink-0" : "w-[112px] shrink-0"}>
            <label className={labelClass}>Unit</label>
            <select
              className={controlClass}
              value={sizeUnit}
              onChange={(e) =>
                onChange({
                  size_preset: parseSizePreset(sizePreset),
                  size_value: sizeValue,
                  size_unit: e.target.value,
                })
              }
            >
              <option value="">{compact ? "—" : "Unit"}</option>
              {SIZE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
    </div>
  );
}
