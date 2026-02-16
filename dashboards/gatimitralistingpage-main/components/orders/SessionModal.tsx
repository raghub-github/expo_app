'use client';

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import { getTodaysSessions, getSessionsByDate, getTotalWorkingHoursToday } from '@/lib/sessionService';
// import { SessionReport } from '@/types';

interface SessionModalProps {
  onClose: () => void;
  onLogout: () => void;
}

interface AllSessionsModalProps {
  sessions: any[];
  onClose: () => void;
}

function AllSessionsModal({ sessions, onClose }: AllSessionsModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2100] backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-xl shadow-hover w-[90%] max-w-[700px] max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-primary-light to-white sticky top-0">
          <h2 className="text-xl font-bold text-neutral-dark flex items-center gap-3">
            <i className="fas fa-list text-primary-dark text-xl"></i>
            All Sessions ({sessions.length})
          </h2>
          <button
            onClick={onClose}
            className="text-xl text-neutral-gray hover:bg-neutral-light w-9 h-9 rounded-full flex items-center justify-center transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <div className="text-xs font-semibold text-neutral-gray mb-1 uppercase tracking-wide">
                      Login Time
                    </div>
                    <div className="text-sm font-semibold text-neutral-dark">
                      {new Date(session.loginTime).toLocaleTimeString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-gray mb-1 uppercase tracking-wide">
                      Logout Time
                    </div>
                    <div className="text-sm font-semibold text-neutral-dark">
                      {new Date(session.logoutTime).toLocaleTimeString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-gray mb-1 uppercase tracking-wide">
                      Duration
                    </div>
                    <div className="text-sm font-semibold text-primary-dark">
                      {session.sessionDuration}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-neutral-gray mb-1 uppercase tracking-wide">
                      Date
                    </div>
                    <div className="text-sm font-semibold text-neutral-dark">
                      {new Date(session.loginTime).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-6 border-t border-gray-200 flex justify-end gap-4 bg-gray-50 sticky bottom-0">
          <button
            onClick={onClose}
            className="bg-neutral-light hover:bg-gray-200 text-neutral-dark font-semibold py-3 px-7 rounded-lg text-[15px] transition-colors flex items-center gap-2 border border-gray-300"
          >
            <i className="fas fa-times"></i>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SessionModal({ onClose, onLogout }: SessionModalProps) {
  const { user } = useSelector((state: RootState) => state.auth);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [totalWorkingHours, setTotalWorkingHours] = useState('00:00');

  useEffect(() => {
    loadSessions();
  }, [selectedDate]);

  const loadSessions = () => {
    const date = new Date(selectedDate);
    const dateSessions = getSessionsByDate(date);
    setSessions(dateSessions);
    
    // Calculate total working hours for the selected date
    let totalMs = 0;
    dateSessions.forEach(session => {
      const [hours, minutes] = session.sessionDuration.split(':').map(Number);
      totalMs += (hours * 60 + minutes) * 60 * 1000;
    });
    
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    setTotalWorkingHours(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
  };

  const displayedSessions = sessions.slice(0, 2);
  const hasMoreSessions = sessions.length > 2;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-xl shadow-hover w-[90%] max-w-[700px] max-h-[90vh] overflow-y-auto">
          <div className="p-6 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-primary-light to-white">
            <h2 className="text-xl font-bold text-neutral-dark flex items-center gap-3">
              <i className="fas fa-chart-line text-primary-dark text-xl"></i>
              Session Report
            </h2>
            <button
              onClick={onClose}
              className="text-xl text-neutral-gray hover:bg-neutral-light w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="p-8">
            {/* Date Filter */}
            <div className="mb-8 p-4 bg-neutral-light rounded-lg border border-gray-200">
              <label className="block text-sm font-semibold text-neutral-dark mb-3">
                <i className="fas fa-calendar mr-2 text-primary-dark"></i>
                Select Date
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-2.5 border border-[#CBD5E1] rounded-lg text-sm font-medium text-neutral-dark outline-none focus:border-primary-mint transition-colors"
              />
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-5 mb-8">
              <div className="bg-neutral-light rounded-xl p-5 border border-gray-200 transition-transform hover:-translate-y-1">
                <div className="text-xs font-semibold text-neutral-gray mb-2 uppercase tracking-wide">
                  Total Sessions Today
                </div>
                <div className="text-[28px] font-bold text-neutral-dark mb-1 font-mono">
                  {sessions.length}
                </div>
                <div className="text-xs text-neutral-gray font-medium">
                  {selectedDate === new Date().toISOString().split('T')[0] ? 'Current session' : 'Completed sessions'}
                </div>
              </div>
              <div className="bg-neutral-light rounded-xl p-5 border-l-4 border-primary-mint border border-gray-200 transition-transform hover:-translate-y-1">
                <div className="text-xs font-semibold text-neutral-gray mb-2 uppercase tracking-wide">
                  Total Working Hours
                </div>
                <div className="text-[28px] font-bold text-primary-dark mb-1 font-mono">
                  {totalWorkingHours}
                </div>
                <div className="text-xs text-neutral-gray font-medium">
                  For selected date
                </div>
              </div>
            </div>

            {/* Sessions List */}
            <div className="mb-8">
              <h3 className="text-base font-bold text-neutral-dark mb-5 flex items-center gap-2.5">
                <i className="fas fa-clock text-primary-dark"></i>
                Session Details
              </h3>
              {displayedSessions.length > 0 ? (
                <div className="space-y-4">
                  {displayedSessions.map((session) => (
                    <div
                      key={session.id}
                      className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow bg-white"
                    >
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-4">
                        <div>
                          <div className="text-xs font-semibold text-neutral-gray mb-2 uppercase tracking-wide">
                            Login Time
                          </div>
                          <div className="text-sm font-semibold text-neutral-dark p-2 bg-neutral-light rounded border border-gray-200">
                            {new Date(session.loginTime).toLocaleTimeString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-neutral-gray mb-2 uppercase tracking-wide">
                            Logout Time
                          </div>
                          <div className="text-sm font-semibold text-neutral-dark p-2 bg-neutral-light rounded border border-gray-200">
                            {new Date(session.logoutTime).toLocaleTimeString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-neutral-gray mb-2 uppercase tracking-wide">
                            Duration
                          </div>
                          <div className="text-sm font-bold text-primary-dark p-2 bg-primary-light rounded border border-primary-mint/30">
                            {session.sessionDuration}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-neutral-gray mb-2 uppercase tracking-wide">
                            Date
                          </div>
                          <div className="text-sm font-semibold text-neutral-dark p-2 bg-neutral-light rounded border border-gray-200">
                            {new Date(session.loginTime).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg bg-gray-50">
                  <i className="fas fa-inbox text-4xl text-neutral-gray mb-3"></i>
                  <p className="text-neutral-gray font-medium">No sessions found for this date</p>
                </div>
              )}
            </div>

            {/* View More Button */}
            {hasMoreSessions && (
              <div className="mb-6 flex justify-center">
                <button
                  onClick={() => setShowAllSessions(true)}
                  className="bg-primary-light hover:bg-primary-light/80 text-primary-dark font-semibold py-3 px-7 rounded-lg text-[15px] transition-colors border border-primary-mint/50 flex items-center gap-2"
                >
                  <i className="fas fa-eye"></i>
                  View More ({sessions.length - 2} more)
                </button>
              </div>
            )}

            <div className="flex gap-4 justify-end pt-6 border-t border-gray-200 mt-5">
              <button
                onClick={onClose}
                className="bg-neutral-light hover:bg-gray-200 text-neutral-dark font-semibold py-3 px-7 rounded-lg text-[15px] transition-colors flex items-center gap-2 border border-gray-300"
              >
                <i className="fas fa-times"></i>
                Close Report
              </button>
              <button
                onClick={onLogout}
                className="bg-red-50 hover:bg-red-100 text-red-700 font-semibold py-3 px-7 rounded-lg text-[15px] transition-colors flex items-center gap-2 border border-red-300"
              >
                <i className="fas fa-sign-out-alt"></i>
                Logout Session
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAllSessions && (
        <AllSessionsModal
          sessions={sessions}
          onClose={() => setShowAllSessions(false)}
        />
      )}
    </>
  );
}




