import type { PropsWithChildren } from "react";

export function PageContainer({ children }: PropsWithChildren) {
  return (
    <div className="container">
      <h1>Customer Dashboard</h1>
      <div className="subtitle">
        Search and manage all GatiMitra users from one unified platform
      </div>
      {children}
    </div>
  );
}
