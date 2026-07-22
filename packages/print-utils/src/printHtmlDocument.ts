/**
 * Print HTML via a hidden same-origin iframe (never popup-blocked).
 * Used by Partner Site and Merchant App web builds.
 */
export function printHtmlDocument(html: string): void {
  if (typeof document === "undefined") return;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    const frameWin = iframe.contentWindow;
    if (!frameWin) {
      cleanup();
      return;
    }
    frameWin.addEventListener("afterprint", cleanup);
    try {
      frameWin.focus();
      frameWin.print();
    } catch {
      /* ignore */
    }
    setTimeout(cleanup, 60000);
  };

  iframe.onload = () => setTimeout(triggerPrint, 150);
  document.body.appendChild(iframe);

  const frameDoc = iframe.contentWindow?.document;
  if (frameDoc) {
    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();
    setTimeout(triggerPrint, 400);
  }
}
