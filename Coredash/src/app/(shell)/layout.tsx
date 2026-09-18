import { resolveCoreSession } from "@/lib/auth/session";
import { ShellChromeProvider } from "@/components/layout/ShellChrome";
import { ShellFrame } from "@/components/layout/ShellFrame";
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
      <ShellChromeProvider>
        <ShellFrame userName={user.fullName} userEmail={user.email} userId={user.authId}>
          {children}
        </ShellFrame>
      </ShellChromeProvider>
    </DashboardIdentityProvider>
  );
}
