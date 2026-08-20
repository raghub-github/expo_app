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
      <StoreMenuClient key={id} storeId={id} />
      <AddonLibraryClient key={`addons-${id}`} storeId={id} />
      <StoreCombosClient key={`combos-${id}`} storeId={id} />
    </StoreMenuTabs>
  );
}
