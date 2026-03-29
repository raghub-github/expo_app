"use client";

import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

type TemplateRow = {
  event_code: string;
  enabled: boolean;
  email_to: string;
  email_cc: string;
  email_bcc: string;
  subject_template: string;
  body_template: string;
  updated_at?: string;
};

const PLACEHOLDER_HELP =
  "{{agent_name}} {{agent_email}} {{ticket_ref}} {{subject}} {{ticket_url}} {{raised_by_name}} {{raised_by_mobile}} {{raised_by_email}} {{status}}";

const NOTIFICATION_SNAPSHOT_KEY = "dashboard_snapshot:ticketNotificationAutomation";
const NOTIFICATION_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Matches server seed (0155) so the form is usable before the network responds. */
function baseTemplateRow(code: "ticket_assigned" | "ticket_reopened"): TemplateRow {
  if (code === "ticket_assigned") {
    return {
      event_code: code,
      enabled: false,
      email_to: "{{agent_email}}",
      email_cc: "",
      email_bcc: "",
      subject_template: "Ticket assigned to you - {{subject}}",
      body_template:
        "Hi {{agent_name}},\n\nA ticket has been assigned to you.\n\nSubject: {{subject}}\nTicket: {{ticket_ref}}\nStatus: {{status}}\n\nOpen in dashboard:\n{{ticket_url}}\n",
    };
  }
  return {
    event_code: code,
    enabled: false,
    email_to: "{{agent_email}}",
    email_cc: "",
    email_bcc: "",
    subject_template: "Ticket reopened - {{subject}}",
    body_template:
      "Hi {{agent_name}},\n\nA ticket assigned to you has been reopened.\n\nSubject: {{subject}}\nTicket: {{ticket_ref}}\nStatus: {{status}}\n\nOpen in dashboard:\n{{ticket_url}}\n",
  };
}

type NotificationAutomationResponse = { success: boolean; data: { templates: TemplateRow[] } };

export function TicketNotificationAutomationSection({
  variant = "page",
  viewMode = "both",
  embedded = false,
}: {
  variant?: "page" | "plain";
  /** Manager page: edit one trigger at a time. Save still persists both templates. */
  viewMode?: "both" | "assigned" | "reopened";
  embedded?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPlain = variant === "plain";

  const initialNotification = useMemo(() => {
    const raw = loadClientSnapshot<NotificationAutomationResponse>(NOTIFICATION_SNAPSHOT_KEY, NOTIFICATION_SNAPSHOT_TTL_MS);
    if (!raw?.success || !Array.isArray(raw.data?.templates)) return undefined;
    return raw;
  }, []);

  const { data, isError, error } = useQuery({
    queryKey: ["ticketNotificationAutomation"],
    queryFn: async (): Promise<NotificationAutomationResponse> => {
      const res = await fetch("/api/tickets/notification-automation", { credentials: "include" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return json as NotificationAutomationResponse;
    },
    staleTime: 5 * 60_000,
    gcTime: 24 * 60 * 60_000,
    initialData: initialNotification,
    initialDataUpdatedAt: initialNotification != null ? 0 : undefined,
  });

  const [assigned, setAssigned] = useState<TemplateRow>(() => baseTemplateRow("ticket_assigned"));
  const [reopened, setReopened] = useState<TemplateRow>(() => baseTemplateRow("ticket_reopened"));

  useLayoutEffect(() => {
    const list = data?.data?.templates;
    if (!list?.length) return;
    for (const t of list) {
      if (t.event_code === "ticket_assigned") setAssigned({ ...baseTemplateRow("ticket_assigned"), ...t });
      if (t.event_code === "ticket_reopened") setReopened({ ...baseTemplateRow("ticket_reopened"), ...t });
    }
  }, [data]);

  useEffect(() => {
    if (data?.success && Array.isArray(data.data?.templates)) {
      saveClientSnapshot(NOTIFICATION_SNAPSHOT_KEY, data);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (templates: TemplateRow[]) => {
      const res = await fetch("/api/tickets/notification-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templates }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Save failed");
      return json as { data: { templates: TemplateRow[] } };
    },
    onSuccess: (json) => {
      queryClient.setQueryData(["ticketNotificationAutomation"], {
        success: true,
        data: { templates: json.data.templates },
      });
      toast("Notification automation saved");
    },
    onError: (e: Error) => {
      toast(e.message || "Save failed", "error");
    },
  });

  const save = () => {
    saveMutation.mutate([assigned, reopened]);
  };

  const renderEditor = (label: string, row: TemplateRow, setRow: (r: TemplateRow) => void) => (
    <div
      className={`space-y-3 border-b border-gray-200 pb-6 last:border-b-0 last:pb-0 ${!row.enabled ? "opacity-75" : ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
        <div className="flex items-center gap-2">
          <span id={`email-trigger-label-${row.event_code}`} className="text-xs font-medium text-gray-600">
            Email trigger
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={row.enabled}
            aria-labelledby={`email-trigger-label-${row.event_code}`}
            onClick={() => setRow({ ...row, enabled: !row.enabled })}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 ${
              row.enabled ? "bg-violet-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
                row.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="text-xs text-gray-500">{row.enabled ? "On" : "Off"}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">To</span>
          <input
            type="text"
            value={row.email_to}
            onChange={(e) => setRow({ ...row, email_to: e.target.value })}
            placeholder="{{agent_email}}"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Cc</span>
          <input
            type="text"
            value={row.email_cc}
            onChange={(e) => setRow({ ...row, email_cc: e.target.value })}
            placeholder="Comma-separated"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-700">Bcc</span>
          <input
            type="text"
            value={row.email_bcc}
            onChange={(e) => setRow({ ...row, email_bcc: e.target.value })}
            placeholder="Comma-separated"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </label>
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-700">Subject</span>
        <input
          type="text"
          value={row.subject_template}
          onChange={(e) => setRow({ ...row, subject_template: e.target.value })}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-gray-700">Body</span>
        <textarea
          value={row.body_template}
          onChange={(e) => setRow({ ...row, body_template: e.target.value })}
          rows={8}
          className="w-full resize-y rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
      </label>
    </div>
  );

  if (isError) {
    return (
      <div className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900 ${isPlain ? "mt-4" : ""}`}>
        <p className="font-medium">Email notification automation unavailable</p>
        <p className="mt-1 text-xs opacity-90">{error instanceof Error ? error.message : "Run migration 0155_ticket_notification_automation.sql"}</p>
      </div>
    );
  }

  const showAssigned = viewMode === "both" || viewMode === "assigned";
  const showReopened = viewMode === "both" || viewMode === "reopened";

  const saveLabel =
    viewMode === "assigned"
      ? "Save assigned email"
      : viewMode === "reopened"
        ? "Save reopened email"
        : "Save notification automation";

  return (
    <section
      className={
        isPlain ? (embedded ? "" : "pt-6") : "rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      }
    >
      {!embedded && (
        <div className={`mb-4 flex items-start gap-2 ${isPlain ? "border-b border-gray-200 pb-3" : "border-b border-gray-100 pb-4"}`}>
          <Bell className="h-5 w-5 shrink-0 text-violet-600" />
          <div>
            <h2 className={`font-semibold text-gray-900 ${isPlain ? "text-base" : "text-lg"}`}>Assign & reopen emails</h2>
            <p className={`mt-0.5 text-gray-600 ${isPlain ? "text-xs" : "text-sm"}`}>
              Turn each card&apos;s <span className="font-medium text-gray-700">Email trigger</span> on to send that email; when off, the server does not send it. Templates use dashboard SMTP / Resend. Placeholders:{" "}
              <span className="font-mono text-[11px] text-gray-500">{PLACEHOLDER_HELP}</span>
            </p>
          </div>
        </div>
      )}

      {embedded && isPlain ? (
        <p className="mb-4 border-b border-gray-200 pb-3 text-xs text-gray-600">
          <span className="font-medium text-gray-800">Email trigger</span> must be on for the server to send. Placeholders:{" "}
          <span className="font-mono text-[11px] text-gray-500">{PLACEHOLDER_HELP}</span>
        </p>
      ) : null}

      <div className="space-y-8">
        {showAssigned ? renderEditor("Ticket assigned to an agent", assigned, setAssigned) : null}
        {showReopened ? renderEditor("Ticket reopened", reopened, setReopened) : null}
      </div>

      <div className={`flex flex-wrap gap-2 ${isPlain ? "mt-6" : "mt-5"}`}>
        <button
          type="button"
          onClick={save}
          disabled={saveMutation.isPending}
          className="cursor-pointer rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
        >
          {saveMutation.isPending ? "Saving…" : saveLabel}
        </button>
      </div>
    </section>
  );
}
