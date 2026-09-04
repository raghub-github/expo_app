"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { AssignAreaManagerPanel } from "../AssignAreaManagerPanel";
import { Loader2 } from "lucide-react";

export default function AssignAreaManagerPageClient() {
  const router = useRouter();

  return (
    <div className="w-full">
      <Suspense
        fallback={
          <div className="flex items-center justify-center gap-2 py-16">
            <Loader2 className="h-5 w-5 animate-spin text-[#121212]/40" />
            <span className="text-sm text-[#121212]/50">Loading…</span>
          </div>
        }
      >
        <AssignAreaManagerPanel
          isOpen={true}
          asModal={false}
          onClose={() => router.push("/dashboard/merchants?portal=admin")}
        />
      </Suspense>
    </div>
  );
}

