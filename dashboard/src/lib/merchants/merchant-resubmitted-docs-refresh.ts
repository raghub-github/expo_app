/** Fired when expired / re-submitted doc queue changes (verify, reject, resubmit). */
export const MERCHANT_RESUBMITTED_DOCS_REFRESH_EVENT = "merchant-resubmitted-docs-refresh";

export function dispatchMerchantResubmittedDocsRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MERCHANT_RESUBMITTED_DOCS_REFRESH_EVENT));
}
