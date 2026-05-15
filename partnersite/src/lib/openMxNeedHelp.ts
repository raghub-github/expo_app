/** Context passed when opening the MX help sidesheet from order details, etc. */
export type MxNeedHelpOpenDetail = {
  formattedOrderId?: string;
  coreOrderId?: number;
  prefillSubject?: string;
  prefillDescription?: string;
};

export const MX_OPEN_NEED_HELP_EVENT = 'mx-open-need-help';

export function openMxNeedHelp(detail?: MxNeedHelpOpenDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MxNeedHelpOpenDetail>(MX_OPEN_NEED_HELP_EVENT, { detail: detail ?? {} }));
}
