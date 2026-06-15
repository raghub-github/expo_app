'use client';

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';

export interface Remark {
  id: string;
  user: string;
  userType: string;
  time: string;
  content: string;
  type: string;
  agentId?: string;
  agentEmail?: string;
  isEdited?: boolean;
  editedTime?: string;
  editHistory?: {
    oldContent: string;
    newContent: string;
    editedBy: string;
    editedAt: string;
  };
}

interface RemarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  remarks: Remark[];
  onUpdateRemark: (remarkId: string, newContent: string) => void;
}

export default function RemarksModal({ isOpen, onClose, remarks, onUpdateRemark }: RemarksModalProps) {
  const { user } = useSelector((state: RootState) => state.auth);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showEditHistory, setShowEditHistory] = useState<string | null>(null);

  if (!isOpen) return null;

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'RIDER':
        return 'bg-gati-info text-white';
      case 'CUSTOMER':
        return 'bg-gati-primary text-white';
      case 'MERCHANT':
        return 'bg-gati-warning text-white';
      case 'SYSTEM':
        return 'bg-gati-text-secondary text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const handleEdit = (remark: Remark) => {
    // Check if already edited
    if (remark.isEdited) {
      alert('This remark has already been edited. A remark can only be edited once.');
      return;
    }
    // Check if current user is the same agent who added the remark
    if (remark.agentEmail && user?.email && remark.agentEmail !== user.email) {
      alert('You can only edit remarks that you added. This remark was added by a different agent.');
      return;
    }
    setEditingId(remark.id);
    setEditContent(remark.content);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editContent.trim()) {
      alert('Please enter a valid remark');
      return;
    }
    onUpdateRemark(editingId, editContent);
    setEditingId(null);
    setEditContent('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const formatTime = (timeStr: string) => {
    // Convert format from "19-12-25 06:11 PM" to "20/12/25, 01:31 am" format
    try {
      const [datePart, timePart, ampm] = timeStr.split(' ');
      const [day, month, year] = datePart.split('-');
      const [time, period] = timePart ? [timePart, ampm] : ['', ''];
      return `${day}/${month}/${year}${time ? `, ${time} ${period?.toLowerCase() || ''}` : ''}`;
    } catch {
      return timeStr;
    }
  };

  return (
    <>
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
              <i className="bi bi-chat-left-text"></i> All Remarks
            </h3>
            <span
              className="text-2xl cursor-pointer text-gati-text-light transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white"
              onClick={onClose}
            >
              ×
            </span>
          </div>
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
            <ul className="list-none m-0 p-0">
              {remarks.map((remark) => (
                <li key={remark.id} className="mb-4 pb-4 border-b border-gati-border-light last:border-b-0 last:mb-0 last:pb-0">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <i className={`bi ${remark.userType === 'Merchant' ? 'bi-shop' : 'bi-person-circle'} text-gati-text-secondary`}></i>
                      <span className="font-semibold text-gati-text-primary">{remark.user}</span>
                      <span className="text-xs text-gati-text-secondary bg-gati-primary-super-light px-2 py-0.5 rounded">
                        {remark.userType}
                      </span>
                      {remark.agentEmail && (
                        <span className="text-xs text-gati-text-secondary bg-gati-background px-2 py-0.5 rounded border border-gati-border-color">
                          {remark.agentEmail}
                        </span>
                      )}
                      {remark.isEdited && (
                        <span className="text-xs text-gati-warning bg-gati-warning/20 px-2 py-0.5 rounded border border-gati-warning">
                          <i className="bi bi-pencil-square"></i> Edited
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gati-text-light text-right">
                      <div>{formatTime(remark.time)}</div>
                      {remark.editedTime && (
                        <div className="text-[10px] text-gati-warning mt-0.5">
                          Edited: {formatTime(remark.editedTime)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {editingId === remark.id ? (
                    <div className="mb-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full p-2.5 border border-gati-border-color rounded-sm text-[13px] text-gati-text-primary bg-white resize-y min-h-[70px] font-['Roboto',sans-serif] mb-2"
                        placeholder="Edit your comment here..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1.5 bg-gati-primary hover:bg-gati-primary-dark text-white border-none rounded-sm font-semibold cursor-pointer transition-all text-[12px] flex items-center gap-1"
                        >
                          <i className="bi bi-check"></i> Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 bg-white hover:bg-gati-primary-super-light border border-gati-border-color text-gati-text-primary rounded-sm font-semibold cursor-pointer transition-all text-[12px] flex items-center gap-1"
                        >
                          <i className="bi bi-x"></i> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-gati-text-primary mb-2">{remark.content}</div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block px-2 py-1 rounded text-[11px] font-semibold ${getTypeColor(remark.type)}`}>
                          {remark.type}
                        </span>
                        {!remark.isEdited && remark.agentEmail === user?.email && (
                          <button
                            onClick={() => handleEdit(remark)}
                            className="text-xs text-gati-primary hover:text-gati-primary-dark font-medium cursor-pointer transition-colors flex items-center gap-1 px-2 py-1 hover:bg-gati-primary-super-light rounded"
                          >
                            <i className="bi bi-pencil"></i> Edit
                          </button>
                        )}
                        {!remark.isEdited && remark.agentEmail !== user?.email && (
                          <span className="text-xs text-gati-text-secondary italic">
                            Only creator can edit
                          </span>
                        )}
                        {remark.editHistory && (
                          <button
                            onClick={() => setShowEditHistory(remark.id)}
                            className="text-xs text-gati-info hover:text-blue-700 font-medium cursor-pointer transition-colors flex items-center gap-1 px-2 py-1 hover:bg-blue-50 rounded"
                          >
                            <i className="bi bi-clock-history"></i> View Edit History
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Edit History Modal */}
      {showEditHistory && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-5"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowEditHistory(null);
          }}
        >
          <div
            className="bg-white rounded-lg w-full max-w-[500px] max-h-[80vh] overflow-hidden shadow-[0_20px_40px_rgba(0,0,0,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gati-info/10 px-6 py-4 border-b border-gati-border-color flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gati-text-primary flex items-center gap-2 m-0">
                <i className="bi bi-clock-history"></i> Edit History
              </h3>
              <span
                className="text-2xl cursor-pointer text-gati-text-light transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-white"
                onClick={() => setShowEditHistory(null)}
              >
                ×
              </span>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-80px)]">
              {(() => {
                const remark = remarks.find(r => r.id === showEditHistory);
                if (!remark?.editHistory) return <p className="text-gati-text-secondary">No edit history available</p>;
                
                return (
                  <div className="space-y-4">
                    <div className="bg-gati-error/10 border border-gati-error/30 rounded-md p-4">
                      <div className="text-xs text-gati-text-secondary mb-2 font-semibold">OLD COMMENT</div>
                      <div className="text-sm text-gati-text-primary">{remark.editHistory.oldContent}</div>
                    </div>
                    <div className="flex items-center justify-center">
                      <i className="bi bi-arrow-down text-gati-primary text-xl"></i>
                    </div>
                    <div className="bg-gati-success/10 border border-gati-success/30 rounded-md p-4">
                      <div className="text-xs text-gati-text-secondary mb-2 font-semibold">NEW COMMENT</div>
                      <div className="text-sm text-gati-text-primary">{remark.editHistory.newContent}</div>
                    </div>
                    <div className="text-xs text-gati-text-secondary pt-2 border-t border-gati-border-color">
                      <div>Edited by: <span className="font-semibold">{remark.editHistory.editedBy}</span></div>
                      <div>Edited at: <span className="font-semibold">{formatTime(remark.editHistory.editedAt)}</span></div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
