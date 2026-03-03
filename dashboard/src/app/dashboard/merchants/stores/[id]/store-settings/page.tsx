import { Suspense } from "react";
import { StoreSettingsClient } from "./StoreSettingsClient";

function StoreSettingsFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  );
}

export default async function StoreSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<StoreSettingsFallback />}>
      <StoreSettingsClient storeId={id} />
    </Suspense>
  );
}
