import { Poppins } from "next/font/google";

/** Primary UI face (replaces geist — avoids Turbopack worker EINVAL on Windows). */
export const poppinsUi = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-geist-sans",
});

export const poppinsMono = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-geist-mono",
});
