"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { AssignAreaManagerPanel } from "../AssignAreaManagerPanel";
import { Loader2 } from "lucide-react";

export default function AssignAreaManagerPageClient() {
  const router = useRouter();

  return (
    <div className="w-full max-w-full px-4 sm:px-6 lg:px-8 py-6">
      <Suspense
        fallback={
          <div className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
            <span className="text-sm text-slate-500">Loading…</span>
          </div>
        }
      >
        <AssignAreaManagerPanel
          isOpen={true}
          asModal={false}
          onClose={() => router.push("/dashboard/merchants")}
        />
      </Suspense>
    </div>
  );
}

