'use client';

import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';

export interface Notification {
  id: string;
  message: string;
  time: string;
  agentEmail: string;
}

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: Notification[];
}

export default function NotificationModal({ isOpen, onClose, notifications }: NotificationModalProps) {
  const { user } = useSelector((state: RootState) => state.auth);

  if (!isOpen) return null;

  const formatTime = (timeStr: string) => {
    try {
      const [datePart, timePart, ampm] = timeStr.split(' ');
      const [day, month, year] = datePart.split('-');
      return `${day}/${month}/${year}${timePart ? `, ${timePart} ${ampm?.toLowerCase() || ''}` : ''}`;
    } catch {
      return timeStr;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-5"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-white rounded-lg w-full max-w-[600px] max-h-[90vh] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.2)] animate-[fadeIn_0.3s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gati-primary-super-light px-6 py-4 border-b border-gati-border-color flex justify-between items-center rounded-t-lg">
          <h3 className="text-lg font-semibold text-gati-text-primary flex items-center gap-2 m-0">
            <i className="bi bi-bell"></i> All Cx Ntf
          </h3>
          <span
            className="text-2xl cursor-pointer text-gati-text-light transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white"
            onClick={onClose}
          >
            ×
          </span>
        </div>
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {notifications.length === 0 ? (
            <p className="text-gati-text-secondary text-center py-8">No notifications sent</p>
          ) : (
            <ul className="list-none m-0 p-0">
              {notifications.map((notification) => (
                <li key={notification.id} className="mb-4 pb-4 border-b border-gati-border-light last:border-b-0 last:mb-0 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <i className="bi bi-person-circle text-gati-text-secondary"></i>
                      <span className="font-semibold text-gati-text-primary">{notification.agentEmail}</span>
                      <span className="text-xs text-gati-text-secondary bg-gati-primary-super-light px-2 py-0.5 rounded">
                        Agent
                      </span>
                    </div>
                    <div className="text-xs text-gati-text-light text-right">
                      {formatTime(notification.time)}
                    </div>
                  </div>
                  <div className="text-sm text-gati-text-primary">
                    <span className="font-semibold">Message:</span> {notification.message}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

