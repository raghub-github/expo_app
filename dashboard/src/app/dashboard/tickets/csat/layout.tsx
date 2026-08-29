import { ticketsNumFont, ticketsTextFont } from "@/lib/fonts/tickets-fonts";

/** Same shell as ticket list/detail: gradient strip + raised white panel */
export default function CsatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${ticketsTextFont.variable} ${ticketsNumFont.variable} flex min-h-0 w-full flex-1 flex-col -mt-3 sm:-mt-4 -mb-3 sm:-mb-4 bg-gradient-to-b from-teal-50/40 via-slate-50/80 to-slate-100/90`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl border border-slate-200/70 border-b-0 bg-white/95 shadow-sm">
        <div className="tickets-typo min-h-0 flex-1 space-y-4 overflow-auto p-5 sm:p-7">
          {children}
        </div>
      </div>
    </div>
  );
}
