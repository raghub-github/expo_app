/** Postgres row subscriptions (messages + ticket row). */
export function ticketPostgresRealtimeTopic(ticketNumericId: number): string {
  return `ticket_${ticketNumericId}`;
}

/**
 * Presence-only topic shared by dashboard + merchant app.
 * Split from postgres channel so mixed configs do not break copresence.
 */
export function ticketPresenceRealtimeTopic(ticketNumericId: number): string {
  return `ticket_presence_${ticketNumericId}`;
}
