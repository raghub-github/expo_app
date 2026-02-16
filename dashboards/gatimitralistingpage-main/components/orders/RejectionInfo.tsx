'use client';

interface RejectionInfoProps {
  rejectionBy?: string;
  rejectionReason?: string;
  rejectionId?: string | number;
}

export default function RejectionInfo({ 
  rejectionBy = 'chatbot',
  rejectionReason = 'Merchant non-responsive',
  rejectionId = '3'
}: RejectionInfoProps) {
  return (
    <div className="h-full bg-white rounded-lg p-4 shadow-[0_2px_8px_rgba(0,0,0,0.08)] border border-[#e5e5e5] transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:border-gati-primary/20 hover:-translate-y-0.5">
      <div className="flex justify-between items-start mb-3 pb-2.5 border-b-2 border-[#e5e5e5]">
        <div className="text-base font-bold text-gati-text-primary flex items-center gap-1.5">
          <i className="bi bi-x-circle"></i>
          <span>Rejection Info</span>
        </div>
      </div>
      <div className="grid gap-1.5">
        <div className="grid grid-cols-[140px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Rejection By:</div>
          <div className="text-[13px] font-medium">
            <span className="text-amber-600">{rejectionBy}</span>
          </div>
        </div>
        <div className="grid grid-cols-[140px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Rejection Reason:</div>
          <div className="text-[13px] font-medium">
            <span className="text-gati-primary">{rejectionReason}</span>
          </div>
        </div>
        <div className="grid grid-cols-[140px_1fr] items-center min-h-[26px]">
          <div className="text-[13px] text-gati-text-secondary font-medium">Rejection ID:</div>
          <div className="text-[13px] text-gati-text-primary font-medium">{rejectionId}</div>
        </div>
      </div>
    </div>
  );
}

