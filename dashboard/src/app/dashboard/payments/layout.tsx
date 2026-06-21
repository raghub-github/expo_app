import { Toaster } from "sonner";

export default function PaymentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster position="top-right" richColors closeButton expand={false} />
    </>
  );
}
