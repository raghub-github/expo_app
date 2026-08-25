/** Keep the onboarding parent on All Stores — never drop to the login default parent. */
export function allStoresPickerHref(
  parentId?: string | number | null,
  highlightStore?: string | null,
  extra?: { verificationSubmitted?: boolean }
): string {
  const q = new URLSearchParams();
  q.set("picker", "1");
  const pid = parentId == null ? "" : String(parentId).trim();
  if (pid) q.set("parent_id", pid);
  const sid = (highlightStore || "").trim();
  if (sid) q.set("highlight_store", sid);
  if (extra?.verificationSubmitted) q.set("verification_updates_submitted", "1");
  return `/partners/all-stores?${q.toString()}`;
}
