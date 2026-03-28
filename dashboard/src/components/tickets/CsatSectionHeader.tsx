"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";

const BASE = "/dashboard/tickets/csat";

export function CsatSectionHeader() {
  const pathname = usePathname();
  const isDetails = pathname.startsWith(`${BASE}/details`);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{"C&D-SAT"}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Customer satisfaction (CSAT) and dissatisfaction (DSAT) for tickets you resolved or closed—ratings 1–5; CSAT ≥4, DSAT ≤2.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Link
            href="/dashboard/tickets"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            All tickets
          </Link>
          <Link
            href="/dashboard/tickets/agent-activity"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Full agent activity
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-gray-200 pb-3" aria-label={"C&D-SAT sections"}>
        <Link
          href={BASE}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            !isDetails ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Overview
        </Link>
        <Link
          href={`${BASE}/details`}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            isDetails ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {"C&D-SAT — Daily breakdown"}
        </Link>
      </nav>
    </div>
  );
}
