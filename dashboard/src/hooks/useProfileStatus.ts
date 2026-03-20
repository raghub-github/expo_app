"use client";

interface ProfileStatusData {
  userId: number;
  systemUserId: string;
  fullName: string;
  email?: string | null;
  avatarUrl?: string | null;
  status: "online" | "offline" | "break" | "emergency";
  loginTime: string | null;
  logoutTime: string | null;
  todayWorkSeconds: number;
  todayOrderCount: number;
}

export function useProfileStatus() {
  return {
    profile: null as ProfileStatusData | null,
    isLoading: false,
    error: null as string | null,
    refresh: () => {},
  };
}


