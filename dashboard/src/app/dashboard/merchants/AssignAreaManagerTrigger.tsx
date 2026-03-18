"use client";

import { useRouter } from "next/navigation";

export function AssignAreaManagerTrigger() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.push("/dashboard/merchants/assign-am")}
      className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
    >
      Assign AM to Stores
    </button>
  );
}

