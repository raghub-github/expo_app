/** IST calendar date key YYYY-MM-DD */
export function istTodayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
