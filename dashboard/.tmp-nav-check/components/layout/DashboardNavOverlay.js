"use client";

// src/components/layout/DashboardNavOverlay.tsx
import { GatiSpinner } from "@/components/ui/GatiSpinner";
import { jsx } from "react/jsx-runtime";
function DashboardNavOverlay({
  visible,
  scope = "main",
  leftOffsetClass = ""
}) {
  if (!visible) return null;
  const className = scope === "main" ? "pointer-events-auto absolute inset-0 z-[80] flex flex-col items-center justify-center bg-[#F3F7FA]" : `pointer-events-auto fixed inset-y-0 right-0 z-[70] flex flex-col items-center justify-center bg-[#F3F7FA] ${leftOffsetClass}`;
  return /* @__PURE__ */ jsx(
    "div",
    {
      className,
      "aria-busy": true,
      "aria-live": "polite",
      "aria-label": "Loading module",
      children: /* @__PURE__ */ jsx(GatiSpinner, {})
    }
  );
}
export {
  DashboardNavOverlay
};
