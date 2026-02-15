"use client";

import { useMerchantSession } from "@/context/MerchantSessionContext";

export default function UserHeader() {
  const merchantSession = useMerchantSession();
  const email = merchantSession?.user?.email ?? null;
  const phone = merchantSession?.user?.phone ?? null;
  const display = email || phone || "Merchant";
  const name = email ? email.split("@")[0] : "Merchant";
  return (
    <div className="w-full flex justify-end items-center sticky top-0 z-50 bg-transparent" style={{ minHeight: 44 }}>
      <div className="flex items-center gap-2 bg-white/90 rounded-full px-2 py-1 shadow border border-slate-100 mt-1 mr-1 min-h-0">
        <div className="w-2 h-2 bg-green-500 rounded-full border-2 border-white mr-1"></div>
        <div className="text-right">
          <p className="font-medium text-slate-900 text-xs flex items-center gap-1 leading-tight">
            {name ? name.charAt(0).toUpperCase() + name.slice(1) : "Merchant"}
          </p>
          <p className="text-[10px] text-slate-500 leading-tight">{display}</p>
        </div>
        <div className="relative">
          <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
        </div>
      </div>
    </div>
  );
}
