import type { FoodHomeLayoutKey } from "@/lib/cxapp-home/food-home-layout";
import type { GridFirstHeroMediaItem } from "@/lib/cxapp-home/grid-first-hero-media";

export type FoodHomePreviewCategory = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export type FoodHomePreviewAllTab = {
  label: string;
  imageUrl: string | null;
};

export type FoodHomePreviewOffer = {
  id: string;
  kind?: "merchant" | "platform";
  title: string;
  sub: string;
  cta: string;
  imageUrl: string | null;
};

export type FoodHomePreviewMerchant = {
  id: string;
  name: string;
  imageUrl: string | null;
  avgRating: number | null;
  offerText: string | null;
  deliveryTime: string | null;
  distanceKm: number | null;
  cuisine: string | null;
  liveStatus: "OPEN" | "CLOSED";
};

export type FoodHomePreviewPayload = {
  stateId: string;
  stateName: string;
  areaLabel: string;
  layoutKey: FoodHomeLayoutKey;
  gridFirstHeroMedia: GridFirstHeroMediaItem[];
  categories: FoodHomePreviewCategory[];
  allTab: FoodHomePreviewAllTab;
  offers: FoodHomePreviewOffer[];
  lovedMerchants: FoodHomePreviewMerchant[];
  restaurants: FoodHomePreviewMerchant[];
  storeCountLabel: string;
  hasLocationSample: boolean;
  subscriptionPlanName: string | null;
  gridFirstSubscriptionRowEnabled: boolean;
  gridFirstSubscriptionRowText: string;
  gridFirstSubscriptionRowBgColor: string;
  gridFirstUnder250Enabled: boolean;
  gridFirstUnder250MaxPrice: number;
  gridFirstUnder250Title: string;
  gridFirstUnder250FilterLabel: string;
  gridFirstUnder250TabImageUrl: string | null;
  gridFirstUnder250HeroImageUrl: string | null;
};
