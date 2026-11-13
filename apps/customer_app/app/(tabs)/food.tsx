/**
 * Food tab — same screen as /home Food listing.
 *
 * Direct import (no React.lazy Suspense). The tab navigator already mounts this
 * route lazily; an extra code-split around FoodMerchantsScreen left customers on
 * FoodTabLoadingShell skeletons while Metro parsed home/index — even after the
 * real header chrome was ready.
 */
import FoodMerchantsScreen from "@/app/home/index";

export default function FoodTab() {
  return <FoodMerchantsScreen />;
}
