import { Suspense } from "react";
import { resolveCoreSession } from "@/lib/auth/session";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { DashboardIdentityProvider } from "@/components/auth/DashboardIdentity";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await resolveCoreSession();
  if (!session.ok) {
    redirect(session.status === 403 ? "/api/auth/denied" : "/login");
  }
  const user = session.user;

  return (
    <DashboardIdentityProvider userId={user.authId} email={user.email}>
      <div className="flex h-dvh overflow-hidden bg-[#F4F6FF]">
        <Sidebar userName={user.fullName} userEmail={user.email} userId={user.authId} />
        <div className="ml-[232px] flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={<div className="h-[72px] shrink-0 border-b border-[#E4E7F7] bg-white" />}>
            <Topbar />
          </Suspense>
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white" />}>
              {children}
            </Suspense>
          </main>
        </div>
      </div>
    </DashboardIdentityProvider>
  );
}
