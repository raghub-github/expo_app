'use client';

import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';

export function buildStoreScheduleSettingsHref(storeId?: string | null): string {
  const params = new URLSearchParams();
  if (storeId?.trim()) params.set('storeId', storeId.trim());
  params.set('tab', 'timings');
  const qs = params.toString();
  return qs ? `/mx/store-settings?${qs}` : '/mx/store-settings?tab=timings';
}

export function OutsideOperatingHoursModal({
  open,
  onClose,
  storeId,
}: {
  open: boolean;
  onClose: () => void;
  storeId?: string | null;
}) {
  const router = useRouter();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center bg-black/50 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-2xl border-2 border-amber-200 bg-white p-6 shadow-2xl sm:max-w-xl">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <Clock size={28} className="text-amber-600" aria-hidden />
          </div>
        </div>
        <h3 className="text-center text-lg font-bold text-gray-900">Outside Operating Hours</h3>
        <div className="mt-3 space-y-2 text-center text-sm text-gray-600">
          <p>
            Your store cannot be turned ON because it is currently outside its scheduled operating hours.
          </p>
          <p>To open your store now, please update your Store Schedule first.</p>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 shrink-0 whitespace-nowrap rounded-lg border-2 border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 sm:text-base"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push(buildStoreScheduleSettingsHref(storeId));
            }}
            className="flex-[1.35] shrink-0 whitespace-nowrap rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 sm:text-base"
          >
            Go to Store Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
