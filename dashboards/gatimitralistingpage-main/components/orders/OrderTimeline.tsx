'use client';

import { useEffect, useState } from 'react';
import { Order } from '@/types';

const timelineStages = [
  { stage: 'Created', time: new Date('2025-12-19T08:12:00'), duration: 0 },
  { stage: 'Bill Ready', time: new Date('2025-12-19T08:12:00'), duration: 0 },
  { stage: 'Paymentinitiated At', time: new Date('2025-12-19T08:25:00'), duration: 0 },
  { stage: 'Payment Done', time: new Date('2025-12-19T08:25:00'), duration: 0 },
  { stage: 'Pymt Assign RX', time: new Date('2025-12-19T08:25:00'), duration: 0 },
  { stage: 'Accepted', time: new Date('2025-12-19T08:43:00'), duration: 17 },
  { stage: 'Dispatch Ready', time: new Date('2025-12-19T09:02:00'), duration: 20 },
  { stage: 'Dispatched', time: new Date('2025-12-19T09:02:00'), duration: 20 },
  { stage: 'Delivered', time: new Date('2025-12-19T09:19:00'), duration: 25 },
  { stage: 'Cancelled', time: new Date('2025-12-19T09:25:00'), duration: 0 },
];

const ETA_TIME = new Date('2025-12-19T09:25:38');

export default function OrderTimeline({ order }: { order: Order }) {
  const [breachedStageIndex, setBreachedStageIndex] = useState<number>(-1);
  const [isCancelled, setIsCancelled] = useState<boolean>(false);

  useEffect(() => {
    const orderStatus = order?.status?.toLowerCase() || '';
    if (orderStatus === 'cancelled' || orderStatus === 'rejected') {
      setIsCancelled(true);
    }

    const dispatchedIndex = timelineStages.findIndex(s => s.stage === 'Dispatched');
    if (dispatchedIndex !== -1) {
      setBreachedStageIndex(dispatchedIndex);
    }
  }, [order?.status]);

  const formatTimeShort = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${day}-${month}-${year} ${hours}:${minutes} ${ampm}`;
  };

  const getStageColor = (index: number, stage: string) => {
    if (stage === 'Cancelled') {
      return { dot: 'bg-blue-500', line: '#3B82F6', text: 'text-blue-600' };
    }
    if (stage === 'Delivered' && isCancelled) {
      return { dot: 'bg-blue-500', line: '#3B82F6', text: 'text-blue-600' };
    }
    if (breachedStageIndex !== -1 && index >= breachedStageIndex && stage !== 'Cancelled') {
      return { dot: 'bg-gati-error', line: '#EF4444', text: 'text-gati-error' };
    }
    return { dot: 'bg-gati-primary', line: '#2E8B57', text: 'text-gati-primary' };
  };

  return (
    <div className="bg-white rounded-lg p-4 mb-4 shadow border border-[#e5e5e5] relative">

      <div className="flex items-center gap-3 mb-4 text-base">
        <i className="bi bi-graph-up"></i>
        <span className="font-semibold">
          Order progress timeline • Delivery, {order.deliveryType}
        </span>
      </div>

      {/* ETA BREACHED BADGE - MOVED OUTSIDE THE TIMELINE CONTAINER TO TOP RIGHT */}
      {breachedStageIndex !== -1 && (
        <div 
          className="absolute"
          style={{
            right: '16px', // RIGHT ALIGNED
            top: '-10px', // MOVED UP ABOVE HEADING
          }}
        >
          <div className="px-3 py-1.5 rounded-full text-[11px] font-semibold text-white whitespace-nowrap bg-gati-error shadow-md">
            ETA breached at {timelineStages[breachedStageIndex].stage}
          </div>
        </div>
      )}

      {/* Stage Titles - TOP ROW */}
      <div className="grid grid-cols-10 mb-2">
        {timelineStages.map(stage => (
          <div
            key={stage.stage}
            className="text-[11px] font-semibold text-center px-1 whitespace-nowrap"
          >
            {stage.stage}
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="relative mt-2">
        {/* MAIN TIMELINE CONTAINER */}
        <div className="relative h-32">
          
          {/* TIMELINE DOT CONNECTION LINE - ALL STAGES IN ONE STRAIGHT LINE */}
          <div className="absolute top-[16px] left-0 right-0">
            <div className="grid grid-cols-10 relative">
              {/* CONNECTING LINES BETWEEN ALL DOTS - ALWAYS GREEN */}
              {timelineStages.slice(0, 9).map((_, index) => {
                if (index < 9) {
                  return (
                    <div
                      key={`line-${index}`}
                      className="absolute top-1/2 h-[4px] transform -translate-y-1/2 z-0"
                      style={{
                        left: `${(index * 100/10) + (100/20)}%`,
                        width: `${100/10}%`,
                        background: '#2E8B57' // ALWAYS GREEN
                      }}
                    />
                  );
                }
                return null;
              })}

              {/* DOTS FOR ALL STAGES */}
              {timelineStages.map((stage, index) => {
                const colors = getStageColor(index, stage.stage);
                
                return (
                  <div
                    key={`dot-${stage.stage}`}
                    className="relative flex flex-col items-center"
                    style={{
                      gridColumn: index + 1
                    }}
                  >
                    {/* CONNECTION LINE TO TIME */}
                    <div className="absolute top-[20px] left-1/2 transform -translate-x-1/2 h-8 w-[2px] bg-gray-200"></div>
                    
                    {/* CIRCLE DOT WITH INNER DOT AND 1px SOLID BORDER CIRCLE (PREMIUM LOOK) */}
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center z-10 border-2 border-white ${colors.dot} relative`}>
                      {/* 1px SOLID BORDER CIRCLE FOR PREMIUM FEEL - WITH COLOR BORDER */}
                      <div className={`absolute w-4 h-4 rounded-full border ${colors.dot.replace('bg-', 'border-')}`}></div>
                      {/* INNER DOT - SMALL SOLID DOT INSIDE CIRCLE */}
                      <div className={`w-1.5 h-1.5 rounded-full ${colors.dot.replace('bg-', 'bg-')}`} />
                    </div>

                    {/* TIME BELOW DOT */}
                    <div className={`absolute top-[50px] text-xs font-medium whitespace-nowrap ${colors.text}`}>
                      {formatTimeShort(stage.time)}
                    </div>

                    {/* DURATION BELOW TIME */}
                    {stage.duration > 0 && (
                      <div className="absolute top-[70px] text-[11px] font-semibold px-1.5 py-0.5 rounded text-gati-primary bg-gati-primary-super-light">
                        {stage.duration}m
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}