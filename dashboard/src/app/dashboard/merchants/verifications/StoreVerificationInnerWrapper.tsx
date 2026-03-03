"use client";

import { useSearchParams } from "next/navigation";
import { StoreVerificationInner } from "./StoreVerificationInner";

export function StoreVerificationInnerWrapper({
  storeId,
  returnTo,
}: {
  storeId: string;
  returnTo: string | null;
}) {
  const searchParams = useSearchParams();
  const returnToFromUrl = searchParams.get("returnTo");

  return (
    <StoreVerificationInner
      storeId={storeId}
      returnTo={returnTo ?? returnToFromUrl}
    />
  );
}
