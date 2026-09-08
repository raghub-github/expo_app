"use client";

import {
  parseSizePreset,
  sizeModeFromPreset,
  type SizeMode,
  type SizePreset,
} from "@/lib/menu-size-preset";

const SIZE_UNITS = ["slices", "kg", "L", "litre", "ml", "serves", "cms", "piece", "grams", "inches"];

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
  disabled?: boolean;
};

export function SizeTypeFields({ sizePreset, sizeValue, sizeUnit, onChange, disabled }: Props) {
  const mode = sizeModeFromPreset(sizePreset);
  const isManual = mode === "MANUAL";

  return (
    <div className="space-y-1.5">
      <div>
        <label className="text-xs font-medium text-gray-600">Size type</label>
        <select
          disabled={disabled}
          className={`w-full px-2.5 py-1.5 border rounded text-sm ${disabled ? "bg-gray-50 border-gray-200" : "border-gray-200"}`}
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
        <div className="flex gap-1.5">
          <input
            type="number"
            min={0}
            readOnly={disabled}
            className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${disabled ? "bg-gray-50 border-gray-200" : "border-gray-200"}`}
            value={sizeValue}
            onChange={(e) =>
              onChange({
                size_preset: parseSizePreset(sizePreset),
                size_value: e.target.value,
                size_unit: sizeUnit,
              })
            }
            placeholder="e.g. 500"
          />
          <select
            disabled={disabled}
            className={`w-1/2 px-2.5 py-1.5 border rounded text-sm ${disabled ? "bg-gray-50 border-gray-200" : "border-gray-200"}`}
            value={sizeUnit}
            onChange={(e) =>
              onChange({
                size_preset: parseSizePreset(sizePreset),
                size_value: sizeValue,
                size_unit: e.target.value,
              })
            }
          >
            <option value="">Unit</option>
            {SIZE_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-[10px] text-gray-500">
          Customer sees {mode === "REGULAR" ? "Regular" : mode === "STANDARD" ? "Standard" : "Premium"}. No
          numeric size required.
        </p>
      )}
    </div>
  );
}
