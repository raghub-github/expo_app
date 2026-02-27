'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MXLayoutWhite } from '@/components/MXLayoutWhite';
import { DEMO_RESTAURANT_ID as DEMO_STORE_ID } from '@/lib/constants';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { MobileHamburgerButton } from '@/components/MobileHamburgerButton';

interface AuditEntry {
  id: string | number; // Can be string (prefixed) or number (legacy)
  action: string;
  action_field?: string | null;
  restriction_type?: string | null;
  performed_by_id: string | number | null;
  performed_by_email: string | null;
  performed_by_name: string | null;
  created_at: string;
  type?: 'status' | 'settings';
}

function AuditLogsContent() {
  const searchParams = useSearchParams();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = searchParams?.get('storeId') ?? typeof window !== 'undefined' ? localStorage.getItem('selectedStoreId') : null;
    setStoreId(id || DEMO_STORE_ID);
  }, [searchParams]);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    fetch(`/api/merchant/audit-logs?storeId=${encodeURIComponent(storeId)}&limit=100`)
      .then((res) => res.json())
      .then((data) => {
        if (data.logs) setLogs(data.logs);
        else setLogs([]);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [storeId]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <MXLayoutWhite restaurantName="Audit logs" restaurantId={storeId || DEMO_STORE_ID}>
      <div className="flex-1 flex flex-col min-h-0 bg-[#f8fafc] overflow-hidden w-full">
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white border-b border-gray-200 shadow-sm -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 sm:py-4 mb-6">
              <div className="flex items-center gap-3">
                {/* Hamburger menu on left (mobile) */}
                <MobileHamburgerButton />
                {/* Back button - hidden on mobile, shown on desktop */}
                <Link
                  href={storeId ? `/mx/dashboard?storeId=${storeId}` : '/mx/dashboard'}
                  className="hidden md:flex p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  <ArrowLeft size={18} />
                </Link>
                {/* Heading - properly aligned */}
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900">Full audit logs</h1>
                  <p className="text-xs sm:text-sm text-gray-600 mt-0.5">Store activity and changes</p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-orange-500" />
              </div>
            ) : logs.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <FileText size={40} className="mx-auto text-gray-300 mb-3" />
                <p className="text-gray-600 font-medium">No audit entries yet</p>
                <p className="text-sm text-gray-500 mt-1">Store open/close and other actions will appear here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Time</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Action</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">Restriction</th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-700">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log, index) => (
                        <tr key={`${log.id}-${index}`} className="border-b border-gray-100 hover:bg-gray-50/50">
                          <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{formatDate(log.created_at)}</td>
                          <td className="py-3 px-4 font-medium text-gray-900">{log.action}</td>
                          <td className="py-3 px-4 text-gray-700">
                            {log.restriction_type 
                              ? log.restriction_type.replace(/_/g, ' ') 
                              : log.action_field 
                                ? log.action_field.replace(/_/g, ' ')
                                : '—'}
                          </td>
                          <td className="py-3 px-4 text-gray-600">{log.performed_by_name || log.performed_by_email || '—'}{log.performed_by_id ? ` (ID: ${log.performed_by_id})` : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MXLayoutWhite>
  );
}

export default function AuditLogsPage() {
  return (
    <Suspense fallback={
      <MXLayoutWhite restaurantName="Audit logs" restaurantId={DEMO_STORE_ID}>
        <div className="flex-1 flex items-center justify-center bg-[#f8fafc]">
          <Loader2 size={24} className="animate-spin text-orange-500" />
        </div>
      </MXLayoutWhite>
    }>
      <AuditLogsContent />
    </Suspense>
  );
}
