import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  resolveCustomerBottomNavHeight,
  STATUS_BAR_TO_HEADER_GAP,
} from "@/constants/layout";

const HEADER_H = 50;
const WEATHER_H = 34;
const PROMO_DOTS_H = 14;
const VERTICAL_GAPS = 14;
const GRID_ROW_GAP = 8;
const GRID_TOP_MARGIN = 10;
const BRAND_TOP_GAP = 16;

/** Sizes promo + service grid + brand banner to fill one screen without scroll. */
export function useHomeScreenLayout(_showWeather: boolean) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    // Always reserve weather height so the layout never shifts when weather loads.
    const weatherBlock = WEATHER_H;
    // Root stack already renders the status-bar strip — home only needs header chrome below it.
    const topBlock = HEADER_H + STATUS_BAR_TO_HEADER_GAP;
    const bottomNavH = resolveCustomerBottomNavHeight(insets.bottom);
    const availableH = screenH - insets.top - bottomNavH;

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

    return {
      promoCardH,
      serviceCardH,
      brandH,
    };
  }, [screenH, insets.top, insets.bottom]);
}
