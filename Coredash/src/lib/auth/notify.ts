"use client";

import { toast } from "sonner";
import { NOT_AUTHORIZED } from "@/lib/auth/access";

export function toastNotAuthorized() {
  toast.error(NOT_AUTHORIZED, {
    duration: 5000,
    className: "cd-toast-denied",
  });
}
