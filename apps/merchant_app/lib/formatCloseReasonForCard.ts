/** Merchant app status card: show By-GatiMitra instead of legacy “(Behalf of Store)”. */
export function formatCloseReasonForCard(raw: string | null | undefined): string | null {
  if (raw == null || String(raw).trim() === "") return null;
  return String(raw).replace(/\s*\(Behalf of Store\)/gi, " By-GatiMitra");
}
