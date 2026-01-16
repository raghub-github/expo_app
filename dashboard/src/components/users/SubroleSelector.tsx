"use client";

import { useEffect, useState } from "react";
import { getSubrolesForRole, getSubroleLabel, hasSubroles } from "@/lib/roles/subrole-mapping";

interface SubroleSelectorProps {
  primaryRole: string;
  value: string;
  otherValue: string;
  onChange: (subrole: string, subroleOther: string) => void;
  disabled?: boolean;
  required?: boolean;
}

export function SubroleSelector({
  primaryRole,
  value,
  otherValue,
  onChange,
  disabled = false,
  required = false,
}: SubroleSelectorProps) {
  const [subroles, setSubroles] = useState<string[]>([]);
  const [showOtherInput, setShowOtherInput] = useState(false);

  useEffect(() => {
    if (primaryRole) {
      const roleSubroles = getSubrolesForRole(primaryRole);
      setSubroles(roleSubroles);
      // Show other input if value is "OTHER" or if otherValue exists (for edit mode)
      setShowOtherInput(value === "OTHER" || (value === "" && otherValue !== ""));
    } else {
      setSubroles([]);
      setShowOtherInput(false);
    }
  }, [primaryRole, value, otherValue]);

  const handleSubroleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedSubrole = e.target.value;
    const isOther = selectedSubrole === "OTHER";
    setShowOtherInput(isOther);
    
    if (isOther) {
      onChange("OTHER", otherValue);
    } else {
      onChange(selectedSubrole, "");
    }
  };

  const handleOtherInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange("OTHER", e.target.value);
  };

  // If role has no subroles defined, don't show the selector
  if (!primaryRole || !hasSubroles(primaryRole)) {
    return null;
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Subrole
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <select
        value={value}
        onChange={handleSubroleChange}
        disabled={disabled}
        required={required}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 bg-white disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <option value="">Select Subrole</option>
        {subroles.map((subrole) => (
          <option key={subrole} value={subrole}>
            {getSubroleLabel(subrole)}
          </option>
        ))}
        <option value="OTHER">Other (Specify)</option>
      </select>

      {showOtherInput && (
        <div className="mt-2">
          <input
            type="text"
            value={otherValue}
            onChange={handleOtherInputChange}
            disabled={disabled}
            required={required && showOtherInput}
            placeholder="Enter subrole name"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900 placeholder-gray-400 disabled:bg-gray-100"
          />
          <p className="mt-1 text-xs text-gray-500">
            Please specify the subrole name
          </p>
        </div>
      )}

      {!primaryRole && (
        <p className="mt-1 text-xs text-gray-500">
          Select a primary role first to see available subroles
        </p>
      )}
    </div>
  );
}
