import { useMemo, useRef } from "react";
import { useWindowDimensions } from "react-native";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import {
  HOME_HEADER_BELOW_STATUS_GAP,
  HOME_WEATHER_BANNER_H,
  resolveCustomerBottomNavHeight,
  resolveTopSafeInset,
} from "@/constants/layout";
import { HOME_BRAND_BANNER_BOTTOM_GAP } from "@/components/home/HomeBrandBanner";

const HEADER_H = 56;
const PROMO_DOTS_H = 14;
const VERTICAL_GAPS = 14;
/** Keep in sync with HomeServicesRow GAP. */
const GRID_ROW_GAP = 12;
const GRID_TOP_MARGIN = 10;
const BRAND_TOP_GAP = 10;
/**
 * Extra air above the floating tab sheet inside the fitted one-screen budget.
 * Keeps the brand card fully visible without relying on a finger scroll.
 */
const TAB_SHEET_VISUAL_GAP = 12;
/** Bump when brand card sizing changes — busts frozen layout cache. */
const BRAND_LAYOUT_REV = "fw-lora-v12-home-dark-soft";

/**
 * Promo + service + brand sizes for Home.
 * On short phones we keep readable mins so content can exceed the viewport —
 * the Home ScrollView then scrolls instead of crushing cards / clipping the brand.
 */
export function useHomeScreenLayout(_showWeather: boolean) {
  const { height: screenH } = useWindowDimensions();
  const insets = useAppSafeAreaInsets();
  const frozenRef = useRef<{
    key: string;
    promoCardH: number;
    serviceCardH: number;
    brandH: number;
  } | null>(null);

  return useMemo(() => {
    const topInset = resolveTopSafeInset(insets.top);
    const bottomNavH = resolveCustomerBottomNavHeight(insets.bottom);
    const layoutKey = `${BRAND_LAYOUT_REV}|${screenH}|${topInset}|${bottomNavH}`;

    if (frozenRef.current && frozenRef.current.key === layoutKey) {
      return frozenRef.current;
    }

    // Always reserve weather height so the layout never shifts when weather loads.
    const weatherBlock = HOME_WEATHER_BANNER_H;
    // Root stack already renders the status-bar strip — home only needs header chrome below it.
    const topBlock = HEADER_H + HOME_HEADER_BELOW_STATUS_GAP;
    const availableH = screenH - topInset - bottomNavH;

    // magicpin end-card ≈ 20% screen (+6px), never include tab-bar height here.
    const brandH = Math.min(206, Math.max(174, Math.round(screenH * 0.2) + 6));
    const promoCardH = Math.min(140, Math.max(128, Math.round(screenH * 0.155)));
    const promoBlock = promoCardH + PROMO_DOTS_H + 8;

    const usedWithoutGrid =
      topBlock +
      weatherBlock +
      VERTICAL_GAPS +
      brandH +
      BRAND_TOP_GAP +
      HOME_BRAND_BANNER_BOTTOM_GAP +
      TAB_SHEET_VISUAL_GAP +
      promoBlock +
      GRID_TOP_MARGIN +
      GRID_ROW_GAP * 2;

    const gridH = availableH - usedWithoutGrid;
    // Prefer ~118–126px cards. Floor at 116 so 3 rows stay tappable on small phones
    // even if that means the page scrolls.
    const fitted = Math.floor(gridH / 3) - 4;
    const serviceCardH = Math.min(126, Math.max(116, fitted > 0 ? fitted : 116));

    const sizes = {
      key: layoutKey,
      promoCardH,
      serviceCardH,
      brandH,
    };
    frozenRef.current = sizes;
    return sizes;
  }, [screenH, insets.top, insets.bottom]);
}
