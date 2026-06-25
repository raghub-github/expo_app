"use client";


import { useAppSearchParams } from "@/lib/navigation/use-app-search-params";
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
