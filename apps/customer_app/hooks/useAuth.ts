import { useAuthStore } from "@/store/authStore";

export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const logout = useAuthStore((s) => s.logout);
  const setSession = useAuthStore((s) => s.setSession);
  const isAuthenticated = !!session?.accessToken;
  return { session, isAuthenticated, logout, setSession };
}
