"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { TicketComposeAutomationSection } from "@/components/tickets/TicketComposeAutomationSection";
import { TicketNotificationAutomationSection } from "@/components/tickets/TicketNotificationAutomationSection";
import { QueueAutoAssignCapSection } from "@/components/tickets/queue/QueueAutoAssignCapSection";
import {
  normalizeQueueManagerSection,
  type QueueManagerSection,
} from "@/lib/tickets/queue-manager-sections";

const SECTION_HEADING: Record<
  QueueManagerSection,
  { title: string; description: string }
> = {
  "max-open": {
    title: "Max open tickets per agent",
    description:
      "Cap concurrent open tickets per agent for queue auto-assign and round-robin. Urgent and high-priority tickets are filled first.",
  },
  compose: {
    title: "Automation",
    description:
      "Default To, Cc, and Bcc when anyone with ticket access opens a reply. Super admins can always edit; others follow server rules.",
  },
  "email-assigned": {
    title: "Assign & reopen emails",
    description: "Email to the agent when a ticket is assigned to them. Toggle the trigger on to send.",
  },
  "email-reopened": {
    title: "Assign & reopen emails",
    description: "Email when a ticket assigned to an agent is reopened. Toggle the trigger on to send.",
  },
};

export function QueueManagerClient() {
  const searchParams = useSearchParams();
  const section = useMemo(
    () => normalizeQueueManagerSection(searchParams.get("section")),
    [searchParams]
  );
  const heading = SECTION_HEADING[section];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-b from-slate-50/80 to-gray-50/90">
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:py-6">
        <div className="mx-auto max-w-3xl">
          <header className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">{heading.title}</h2>
            <p className="mt-1 text-sm text-gray-600">{heading.description}</p>
          </header>

          {section === "max-open" ? <QueueAutoAssignCapSection embedded /> : null}

          {section === "compose" ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <TicketComposeAutomationSection variant="plain" embedded />
            </div>
          ) : null}

          {section === "email-assigned" || section === "email-reopened" ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <TicketNotificationAutomationSection
                variant="plain"
                embedded
                viewMode={section === "email-assigned" ? "assigned" : "reopened"}
              />
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
