"use client";

import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { StoreVerificationInner } from "./StoreVerificationInner";

export function StoreVerificationInnerWrapper({
  storeId,
  returnTo,
}: {
  storeId: string;
  returnTo: string | null;
}) {
  const searchParams = useAppSearchParams();
  const returnToFromUrl = searchParams.get("returnTo");

  return (
    <StoreVerificationInner
      storeId={storeId}
      returnTo={returnTo ?? returnToFromUrl}
    />
  );
}
