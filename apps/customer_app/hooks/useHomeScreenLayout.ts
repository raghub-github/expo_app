import { useMemo } from "react";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BAR_H = 56;
const HEADER_H = 50;
const WEATHER_H = 34;
const PROMO_DOTS_H = 14;
const VERTICAL_GAPS = 14;
const GRID_ROW_GAP = 8;
const GRID_TOP_MARGIN = 10;
const BRAND_TOP_GAP = 16;

/** Sizes promo + service grid + brand banner to fill one screen without scroll. */
export function useHomeScreenLayout(showWeather: boolean) {
  const { height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const weatherBlock = showWeather ? WEATHER_H : 0;
    const topBlock = insets.top + HEADER_H;
    const bottomBlock = insets.bottom + TAB_BAR_H;

    const brandH = Math.min(116, Math.max(102, Math.round(screenH * 0.122)));
    const promoCardH = Math.min(140, Math.max(128, Math.round(screenH * 0.155)));
    const promoBlock = promoCardH + PROMO_DOTS_H + 8;

    const usedWithoutGrid =
      topBlock +
      bottomBlock +
      weatherBlock +
      VERTICAL_GAPS +
      brandH +
      BRAND_TOP_GAP +
      promoBlock +
      GRID_TOP_MARGIN +
      GRID_ROW_GAP * 2;

    const gridH = screenH - usedWithoutGrid;
    const serviceCardH = Math.min(120, Math.max(100, Math.floor(gridH / 3) - 4));

    return {
      promoCardH,
      serviceCardH,
      brandH,
    };
  }, [screenH, insets.top, insets.bottom, showWeather]);
}
