"use client";

import React from "react";
import {
  normalizeDecimalOnBlur,
  normalizeIntegerOnBlur,
  sanitizeDecimalInput,
  sanitizeIntegerInput,
} from "@/lib/pricing/slabInputUtils";

export const SLAB_INPUT_CLS =
  "w-full min-w-[4rem] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-mono text-slate-900 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400";

type SlabNumericInputProps = {
  value: string;
  onChange: (value: string) => void;
  kind: "decimal" | "integer";
  className?: string;
  disabled?: boolean;
  placeholder?: string;
};

export function SlabNumericInput({
  value,
  onChange,
  kind,
  className = SLAB_INPUT_CLS,
  disabled,
  placeholder,
}: SlabNumericInputProps) {
  return (
    <input
      className={className}
      inputMode={kind === "integer" ? "numeric" : "decimal"}
      disabled={disabled}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const next =
          kind === "integer"
            ? sanitizeIntegerInput(e.target.value)
            : sanitizeDecimalInput(e.target.value);
        onChange(next);
      }}
      onBlur={(e) => {
        const normalized =
          kind === "integer"
            ? normalizeIntegerOnBlur(e.target.value)
            : normalizeDecimalOnBlur(e.target.value);
        if (normalized !== value) onChange(normalized);
      }}
    />
  );
}
