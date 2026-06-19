// import { SessionReport, SessionTiming } from '@/types';

const SESSION_KEY = 'gati_session_timing';
const SESSIONS_KEY = 'gati_all_sessions';
const WEBHOOK_URL = 'https://chat.googleapis.com/v1/spaces/AAAApQqnZDM/messages';

/**
 * Get Supabase client safely
 */
const getSupabaseClient = () => {
  try {
    if (typeof window !== 'undefined') {
      // Client-side only
      const { supabase } = require('@/lib/supabase/client');
      return supabase;
    }
  } catch (error) {
    console.log('Supabase not available');
  }
  return null;
};

/**
 * Get the current session timing from localStorage
 */
export const getSessionTiming = (): any | null => {
  if (typeof window === 'undefined') return null;
  
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
};

/**
 * Start a new session timer
 */
export const startSessionTimer = (agentId: string): any => {
  if (typeof window === 'undefined') {
    return {
      loginTime: new Date().toISOString(),
      startTimestamp: Date.now(),
    };
  }

  const timing: any = {
    loginTime: new Date().toISOString(),
    startTimestamp: Date.now(),
  };

  localStorage.setItem(SESSION_KEY, JSON.stringify(timing));
  return timing;
};

/**
 * Get elapsed time since session started (in milliseconds)
 */
export const getElapsedTime = (): number => {
  const timing = getSessionTiming();
  if (!timing) return 0;
  
  return Date.now() - timing.startTimestamp;
};

/**
 * Format milliseconds to HH:MM format
 */
export const formatDuration = (ms: number): string => {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/**
 * Format milliseconds to HH:MM:SS format (for display)
 */
export const formatDurationFull = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`;
};

/**
 * Save session to local storage for persistence
 */
export const saveSessionToLocalStorage = (report: any): void => {
  if (typeof window === 'undefined') return;
  
  let sessions: any[] = [];
  const stored = localStorage.getItem(SESSIONS_KEY);
  
  if (stored) {
    try {
      sessions = JSON.parse(stored);
    } catch {
      sessions = [];
    }
  }
  
  sessions.push(report);
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
};

/**
 * Get all sessions for today from localStorage
 */
export const getTodaysSessions = (): any[] => {
  if (typeof window === 'undefined') return [];
  
  const stored = localStorage.getItem(SESSIONS_KEY);
  if (!stored) return [];
  
  try {
    const allSessions: any[] = JSON.parse(stored);
    const today = new Date().toDateString();
    
    return allSessions.filter(session => {
      const sessionDate = new Date(session.createdAt).toDateString();
      return sessionDate === today;
    });
  } catch {
    return [];
  }
};

/**
 * Get sessions for a specific date
 */
export const getSessionsByDate = (date: Date): any[] => {
  if (typeof window === 'undefined') return [];
  
  const stored = localStorage.getItem(SESSIONS_KEY);
  if (!stored) return [];
  
  try {
    const allSessions: any[] = JSON.parse(stored);
    const targetDate = date.toDateString();
    
    return allSessions.filter(session => {
      const sessionDate = new Date(session.createdAt).toDateString();
      return sessionDate === targetDate;
    });
  } catch {
    return [];
  }
};

/**
 * Calculate total working hours for today
 */
export const getTotalWorkingHoursToday = (): string => {
  const sessions = getTodaysSessions();
  let totalMs = 0;
  
  sessions.forEach(session => {
    // Parse HH:MM format
    const [hours, minutes] = session.sessionDuration.split(':').map(Number);
    totalMs += (hours * 3600 + minutes * 60) * 1000;
  });
  
  return formatDuration(totalMs);
};

/**
 * Generate and save session report
 */
export const generateSessionReport = async (agentId: string): Promise<any | null> => {
  const timing = getSessionTiming();
  if (!timing) return null;
  
  const now = new Date();
  const loginTime = new Date(timing.loginTime);
  const sessionDuration = formatDuration(Date.now() - timing.startTimestamp);
  const totalWorkingHours = getTotalWorkingHoursToday();
  
  const report: any = {
    id: `${agentId}_${Date.now()}`,
    agentId,
    loginTime: timing.loginTime,
    logoutTime: now.toISOString(),
    sessionDuration,
    totalWorkingHoursToday: totalWorkingHours,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  
  // Save to localStorage
  saveSessionToLocalStorage(report);
  
  // Try to save to Supabase
  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('session_reports').insert([report]);
    }
  } catch (error) {
    console.error('Failed to save session report to Supabase:', error);
    // Continue anyway - we have it in localStorage
  }
  
  // Send to webhook
  try {
    await sendReportToWebhook(report);
  } catch (error) {
    console.error('Failed to send report to webhook:', error);
    // Don't fail - the report is already saved locally
  }
  
  return report;
};

/**
 * Send session report to webhook
 */
export const sendReportToWebhook = async (report: any): Promise<void> => {
  try {
    const message = {
      text: `📊 Session Report\n\n` +
            `Agent ID: ${report.agentId}\n` +
            `Login Time: ${new Date(report.loginTime).toLocaleString()}\n` +
            `Logout Time: ${new Date(report.logoutTime).toLocaleString()}\n` +
            `Session Duration: ${report.sessionDuration}\n` +
            `Total Working Hours Today: ${report.totalWorkingHoursToday}`,
    };
    
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    
    if (!response.ok) {
      throw new Error(`Webhook request failed: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error sending report to webhook:', error);
    throw error;
  }
};

/**
 * Clear session data on logout
 */
export const clearSessionData = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
};

/**
 * Resume session after internet disconnection
 */
export const resumeSession = (): any | null => {
  const timing = getSessionTiming();
  if (!timing) return null;
  
  // Update the last resumed time
  const updated: any = {
    ...timing,
    lastResumedAt: Date.now(),
  };
  
  localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
  return updated;
};
