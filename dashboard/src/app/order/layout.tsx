import DashboardAppProviders from "@/providers/DashboardAppProviders";
import "bootstrap-icons/font/bootstrap-icons.css";
import { geistMono, geistSans } from "@/lib/fonts/app-fonts";
import { ticketsNumFont, ticketsTextFont } from "@/lib/fonts/tickets-fonts";

export const dynamic = "force-dynamic";

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${geistSans.variable} ${geistMono.variable} ${ticketsTextFont.variable} ${ticketsNumFont.variable}`}
    >
      <DashboardAppProviders>{children}</DashboardAppProviders>
    </div>
  );
}
