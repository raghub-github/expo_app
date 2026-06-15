'use client';

interface StatusTabsProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

const statuses = [
  'PAYMENT DONE',
  'ACCEPTED',
  'DESPATCH READY',
  'DESPATCHED',
];

export default function StatusTabs({
  selectedStatus,
  onStatusChange,
}: StatusTabsProps) {
  return (
    <div className="bg-white rounded-lg p-[15px] mb-[25px] shadow-default border border-[#F1F5F9]">
      <div className="flex gap-2.5 flex-wrap">
        {statuses.map((status) => (
          <div
            key={status}
            onClick={() => onStatusChange(status)}
            className={`flex-1 min-w-[200px] text-center py-4 px-2.5 rounded-md font-semibold text-[15px] border-2 cursor-pointer transition-all ${
              selectedStatus === status
                ? 'bg-primary-mint text-neutral-dark border-primary-mint shadow-[0_4px_12px_rgba(63,224,197,0.2)]'
                : 'bg-neutral-light text-neutral-gray border-transparent hover:bg-white hover:border-primary-light'
            }`}
          >
            {status}
          </div>
        ))}
      </div>
    </div>
  );
}
