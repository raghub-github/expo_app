"use client";

import { useState } from "react";
import { Bell, X } from "lucide-react";

interface MaintenanceNotificationButtonProps {
  /** When true, positions left of Add Service Point button */
  hasAdjacentButton?: boolean;
  /** Controlled mode: when set, no button, only modal (triggered externally) */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Maintenance Notification button - for admin maintenance announcements.
 * Future: Integrate with popup/notification system.
 */
export function MaintenanceNotificationButton({ hasAdjacentButton, isOpen: controlledOpen, onOpenChange }: MaintenanceNotificationButtonProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;
  const setOpen = (open: boolean) => {
    if (isControlled && onOpenChange) onOpenChange(open);
    else setInternalOpen(open);
  };

  return (
    <>
      {!isControlled && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-6 z-50 flex items-center gap-2 px-4 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${hasAdjacentButton ? "right-44 sm:right-52" : "right-6"}`}
          title="Maintenance Notification"
        >
          <Bell className="h-5 w-5" />
          <span className="hidden sm:inline text-sm font-medium">Maintenance Notification</span>
        </button>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Bell className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Maintenance Notification</h2>
                  <p className="text-sm text-gray-500">Push admin announcements</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-4">
                This feature will allow admins to push maintenance announcements to users. Integration with notification system coming soon.
              </p>
              <div className="flex justify-end">
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
