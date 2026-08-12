"use client";
import { useAppParams, useAppPathname } from "@/hooks/useAppSearchParams";

import { useEffect } from "react";

import { useTicketsNavPending } from "@/context/TicketsNavPendingContext";
import { useBrowserPathname } from "@/hooks/tickets/useBrowserPathname";
import { ticketsPathTicketId } from "@/lib/tickets/ticket-path-utils";
import { TicketDashboardClient } from "./TicketDashboardClient";
import { TicketDetailLoader } from "./ticket-view/TicketDetailLoader";

/**
 * Single client boundary for `/dashboard/tickets` and `/dashboard/tickets/[id]` so navigating
 * between the list and a ticket does not swap server-rendered trees (which unmounted the list
 * and reset scroll/state). The list stays mounted (hidden) while a ticket is open.
 */
export function TicketsWorkspaceClient() {
  return <TicketsWorkspaceClientInner />;
}

function TicketsWorkspaceClientInner() {
  const params = useAppParams();
  const pathname = useAppPathname();
  const browserPathname = useBrowserPathname();
  const { pendingTicketId } = useTicketsNavPending();
  const slug = (params?.slug as string[] | undefined) ?? [];
  const cleanPath = pathname.split("?")[0].split("#")[0];
  const browserClean = browserPathname || cleanPath;

  // Strict: the Tickets workspace should never scroll the main window.
  // Only inner panes should scroll.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = {
      height: html.style.height,
      overflow: html.style.overflow,
    };
    const prevBody = {
      height: body.style.height,
      overflow: body.style.overflow,
    };
    html.style.height = "100%";
    html.style.overflow = "hidden";
    body.style.height = "100%";
    body.style.overflow = "hidden";
    return () => {
      html.style.height = prevHtml.height;
      html.style.overflow = prevHtml.overflow;
      body.style.height = prevBody.height;
      body.style.overflow = prevBody.overflow;
    };
  }, []);

  if (slug.length > 1) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-medium">Invalid ticket ID</p>
      </div>
    );
  }

  const slugSegment = slug.length === 1 ? slug[0].trim() : "";
  const pathTicketId = ticketsPathTicketId(cleanPath);
  const browserTicketId = ticketsPathTicketId(browserClean);
  const isTicketsListPath =
    cleanPath === "/dashboard/tickets" || browserClean === "/dashboard/tickets";
  const pathOrSlugTicketId =
    browserTicketId ?? pathTicketId ?? (slugSegment !== "" ? slugSegment : null);
  /** Never keep detail open on the list URL — pending id is only for in-flight detail nav. */
  const resolvedTicketId = isTicketsListPath ? null : pathOrSlugTicketId ?? pendingTicketId;
  const showDetail = Boolean(resolvedTicketId?.trim());

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden tickets-typo">
      <div className={showDetail ? "hidden" : "flex min-h-0 flex-1 flex-col"} aria-hidden={showDetail}>
        <TicketDashboardClient />
      </div>
      {showDetail && resolvedTicketId ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <TicketDetailLoader ticketId={resolvedTicketId} />
        </div>
      ) : null}
    </div>
  );
}
