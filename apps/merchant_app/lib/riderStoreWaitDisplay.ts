/** Format rider store wait duration as MM:SS mins (merchant app style). */
export function formatRiderStoreWaitDuration(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  }
  return `${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")} mins`;
}
