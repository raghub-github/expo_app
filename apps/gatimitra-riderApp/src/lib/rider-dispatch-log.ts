const PREFIX = "[RiderDispatch]";

/** Lightweight dispatch diagnostics — visible in Metro / device logs. */
export function riderDispatchLog(message: string, detail?: unknown): void {
  if (__DEV__) {
    if (detail !== undefined) {
      console.log(`${PREFIX} ${message}`, detail);
    } else {
      console.log(`${PREFIX} ${message}`);
    }
  }
}

export function riderDispatchWarn(message: string, detail?: unknown): void {
  if (!__DEV__) return;
  if (detail !== undefined) {
    console.warn(`${PREFIX} ${message}`, detail);
  } else {
    console.warn(`${PREFIX} ${message}`);
  }
}
