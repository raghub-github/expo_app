import { useMemo, useRef } from "react";
import { useWindowDimensions } from "react-native";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import {
  HOME_HEADER_BELOW_STATUS_GAP,
  HOME_WEATHER_BANNER_H,
  resolveCustomerBottomNavHeight,
  resolveTopSafeInset,
} from "@/constants/layout";

const HEADER_H = 56;
const PROMO_DOTS_H = 14;
const VERTICAL_GAPS = 14;
const GRID_ROW_GAP = 8;
const GRID_TOP_MARGIN = 10;
const BRAND_TOP_GAP = 16;

/** Sizes promo + service grid + brand banner to fill one screen without scroll. */
export function useHomeScreenLayout(_showWeather: boolean) {
  const { height: screenH } = useWindowDimensions();
  const insets = useAppSafeAreaInsets();
  const frozenRef = useRef<{
    screenH: number;
    promoCardH: number;
    serviceCardH: number;
    brandH: number;
  } | null>(null);

  return useMemo(() => {
    if (frozenRef.current && frozenRef.current.screenH === screenH) {
      return frozenRef.current;
    }

    const topInset = resolveTopSafeInset(insets.top);
    // Always reserve weather height so the layout never shifts when weather loads.
    const weatherBlock = HOME_WEATHER_BANNER_H;
    // Root stack already renders the status-bar strip — home only needs header chrome below it.
    const topBlock = HEADER_H + HOME_HEADER_BELOW_STATUS_GAP;
    const bottomInset = insets.bottom;
    const bottomNavH = resolveCustomerBottomNavHeight(bottomInset);
    const availableH = screenH - topInset - bottomNavH;

    const brandH = Math.min(116, Math.max(102, Math.round(screenH * 0.122)));
    const promoCardH = Math.min(140, Math.max(128, Math.round(screenH * 0.155)));
    const promoBlock = promoCardH + PROMO_DOTS_H + 8;

    const usedWithoutGrid =
      topBlock +
      weatherBlock +
      VERTICAL_GAPS +
      brandH +
      BRAND_TOP_GAP +
      promoBlock +
      GRID_TOP_MARGIN +
      GRID_ROW_GAP * 2;

    const gridH = availableH - usedWithoutGrid;
    const serviceCardH = Math.min(120, Math.max(100, Math.floor(gridH / 3) - 4));

    const sizes = {
      screenH,
      promoCardH,
      serviceCardH,
      brandH,
    };
    frozenRef.current = sizes;
    return sizes;
  }, [screenH, insets.top, insets.bottom]);
}
