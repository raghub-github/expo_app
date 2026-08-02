import localFont from "next/font/local";

/** Descriptive copy on Tickets dashboard */
export const ticketsTextFont = localFont({
  src: [
    { path: "../../fonts/lora/lora-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/lora/lora-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/lora/lora-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/lora/lora-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-tickets-text",
  display: "swap",
});

/** Digits, IDs, timestamps, counts on Tickets dashboard */
export const ticketsNumFont = localFont({
  src: [
    { path: "../../fonts/poppins/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../../fonts/poppins/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-tickets-num",
  display: "swap",
});

/** Shared Lora className for order/ticket banners that need the face directly. */
export const loraDisplay = ticketsTextFont;

/** Shared Poppins for chrome that applies className (e.g. sidebar). */
export const poppinsUi = ticketsNumFont;
