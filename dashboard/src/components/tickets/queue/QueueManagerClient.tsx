"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { TicketComposeAutomationSection } from "@/components/tickets/TicketComposeAutomationSection";
import { TicketNotificationAutomationSection } from "@/components/tickets/TicketNotificationAutomationSection";
import { QueueAutoAssignCapSection } from "@/components/tickets/queue/QueueAutoAssignCapSection";
import { AgentCapacitySection } from "@/components/tickets/queue/AgentCapacitySection";
import { TicketWorkflowRulesSection } from "@/components/tickets/queue/TicketWorkflowRulesSection";
import { QueueAssignmentSoundSection } from "@/components/tickets/queue/QueueAssignmentSoundSection";
import { QueueResponseTemplatesSection } from "@/components/tickets/queue/QueueResponseTemplatesSection";
import {
  normalizeQueueManagerSection,
  type QueueManagerSection,
} from "@/lib/tickets/queue-manager-sections";

const SECTION_HEADING: Record<
  QueueManagerSection,
  { title: string; description: string }
> = {
  "max-open": {
    title: "",
    description: "",
  },
  "agent-capacity": {
    title: "Agent capacity",
    description: "Per-agent limits on open tickets for auto-assignment.",
  },
  "assignment-sound": {
    title: "Queue alert sound",
    description: "Notify agents with an optional sound when a new or updated ticket appears in their queue.",
  },
  "email-assigned": {
    title: "Assign & reopen emails",
    description: "Email to the agent when a ticket is assigned to them. Toggle the trigger on to send.",
  },
  "email-reopened": {
    title: "Assign & reopen emails",
    description: "Email when a ticket assigned to an agent is reopened. Toggle the trigger on to send.",
  },
  "workflow-rules": {
    title: "Workflow automation",
    description:
      "Create IF/THEN rules for assignment, status, priority, tags, and notifications. Runs on ticket create/update, when agents go online, and when they go fully offline (not break or busy).",
  },
  "response-templates": {
    title: "Response library",
    description: "Manage quick replies and knowledge base snippets shown in the conversation composer.",
  },
};

export function QueueManagerClient() {
  const searchParams = useSearchParams();
  const section = useMemo(
    () => normalizeQueueManagerSection(searchParams.get("section")),
    [searchParams]
  );
  const heading = SECTION_HEADING[section];

  const isWorkflowRules = section === "workflow-rules";
  const isMaxOpen = section === "max-open";
  const isAgentCapacity = section === "agent-capacity";
  const isResponseTemplates = section === "response-templates";

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${isResponseTemplates ? "bg-white" : "bg-gradient-to-b from-slate-50/80 to-gray-50/90"}`}>
      <main
          className={
            isWorkflowRules || isResponseTemplates
              ? "min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1 sm:px-4 sm:pb-5 sm:pt-2"
              : "min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:py-6"
          }
        >
          <div
            className={
              isWorkflowRules || isResponseTemplates
                ? "w-full"
                : `mx-auto ${isMaxOpen || isAgentCapacity ? "max-w-5xl" : "max-w-3xl"}`
            }
          >
            {!isWorkflowRules && !isMaxOpen && !isAgentCapacity && !isResponseTemplates ? (
            <header className="mb-5">
              <h2 className="text-base font-semibold text-gray-900">{heading.title}</h2>
              {heading.description ? <p className="mt-1 text-sm text-gray-600">{heading.description}</p> : null}
            </header>
          ) : null}

          {isMaxOpen ? (
            <div className="space-y-10">
              <QueueAutoAssignCapSection embedded />
              <div className="border-t border-gray-200 pt-8">
                <h3 className="text-sm font-semibold text-gray-900">Default reply recipients</h3>
                <TicketComposeAutomationSection
                  variant="plain"
                  embedded
                  saveButtonLabel="Updated"
                  saveSuccessMessage="Default recipients updated"
                  resetSuccessMessage="Default recipients cleared"
                  actionButtonTone="slate"
                  requireDirtyToSave
                />
              </div>
            </div>
          ) : null}

          {section === "assignment-sound" ? <QueueAssignmentSoundSection /> : null}

          {section === "email-assigned" || section === "email-reopened" ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <TicketNotificationAutomationSection
                variant="plain"
                embedded
                viewMode={section === "email-assigned" ? "assigned" : "reopened"}
              />
            </div>
          ) : null}

          {isAgentCapacity ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <AgentCapacitySection embedded />
            </div>
          ) : null}

          {section === "workflow-rules" ? <TicketWorkflowRulesSection embedded /> : null}
          {section === "response-templates" ? <QueueResponseTemplatesSection /> : null}
        </div>
      </main>
    </div>
  );
}
