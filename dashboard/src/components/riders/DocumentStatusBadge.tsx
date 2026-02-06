"use client";

import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

interface DocumentStatusBadgeProps {
  verified: boolean;
  rejectedReason?: string | null;
  verifierName?: string | null;
  verifiedAt?: Date | string | null;
  className?: string;
}

export function DocumentStatusBadge({
  verified,
  rejectedReason,
  verifierName,
  verifiedAt,
  className = "",
}: DocumentStatusBadgeProps) {
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (verified) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-semibold">
          <CheckCircle className="h-3.5 w-3.5" />
          Verified
        </span>
        {verifierName && (
          <span className="text-xs text-gray-600">
            by {verifierName}
            {verifiedAt && ` on ${formatDate(verifiedAt)}`}
          </span>
        )}
      </div>
    );
  }

  if (rejectedReason) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-800 text-xs font-semibold">
          <XCircle className="h-3.5 w-3.5" />
          Rejected
        </span>
        {rejectedReason && (
          <div className="group relative">
            <AlertCircle className="h-4 w-4 text-red-600 cursor-help" />
            <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-10 w-64 p-2 bg-gray-900 text-white text-xs rounded shadow-lg">
              <div className="font-semibold mb-1">Rejection Reason:</div>
              <div>{rejectedReason}</div>
              {verifierName && (
                <div className="mt-1 text-gray-300">
                  by {verifierName}
                  {verifiedAt && ` on ${formatDate(verifiedAt)}`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 text-xs font-semibold">
        <Clock className="h-3.5 w-3.5" />
        Pending
      </span>
    </div>
  );
}
