import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F4F6FF]" />}>
      <LoginForm />
    </Suspense>
  );
}
