const ACTION = "[RiderAction]";
const NETWORK = "[RiderNetwork]";

export function riderActionLog(event: string, detail?: Record<string, unknown>): void {
  if (detail) console.log(`${ACTION} ${event}`, detail);
  else console.log(`${ACTION} ${event}`);
}

export function riderNetworkLog(event: string, detail?: Record<string, unknown>): void {
  if (detail) console.log(`${NETWORK} ${event}`, detail);
  else console.log(`${NETWORK} ${event}`);
}
