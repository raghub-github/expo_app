import AuthenticatedShell from "@/providers/AuthenticatedShell";

export default function OrderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
