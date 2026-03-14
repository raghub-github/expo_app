import { StoreMenuClient } from "./StoreMenuClient";
import { AddonLibraryClient } from "./AddonLibraryClient";
import { StoreCombosClient } from "./StoreCombosClient";
import { StoreMenuTabs } from "./StoreMenuTabs";

export default async function StoreMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <StoreMenuTabs storeId={id}>
      <StoreMenuClient storeId={id} />
      <AddonLibraryClient storeId={id} />
      <StoreCombosClient storeId={id} />
    </StoreMenuTabs>
  );
}
