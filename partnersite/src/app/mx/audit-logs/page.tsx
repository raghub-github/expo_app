import { Suspense } from 'react';
import AuditLogsClient from './AuditLogsClient';

export default function AuditLogsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-2 bg-[#f8fafc] text-slate-500">
          <span className="text-sm">Loading audit logs…</span>
        </div>
      }
    >
      <AuditLogsClient />
    </Suspense>
  );
}
