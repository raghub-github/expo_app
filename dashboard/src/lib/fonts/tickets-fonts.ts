import { Lora, Poppins } from "next/font/google";

/** Descriptive copy on Tickets dashboard */
export const ticketsTextFont = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-tickets-text",
  display: "swap",
});

/** Digits, IDs, timestamps, counts on Tickets dashboard */
export const ticketsNumFont = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-tickets-num",
  display: "swap",
});
