/**
 * Cold start / app reopen: do NOT auto-open live navigation.
 * Incoming-modal accept still navigates via IncomingRideOrderHost.navigateAfterAccept.
 * Rider re-enters manually via Active Ride FAB after a reload.
 */
export function ActiveOrderResumeBootstrap() {
  return null;
}
