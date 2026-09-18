/**
 * Shared ScrollView / list props for native-feel free scrolling.
 *
 * Free-scroll rails (store item carousels, category chips, under-price rows)
 * should glide with platform momentum and stop cleanly at content bounds —
 * no paging, no snap, no custom scrollTo during fling.
 */

import { Platform } from "react-native";
import {
  buildNaturalHorizontalScrollProps,
  buildNaturalVerticalScrollProps,
  naturalDecelerationRate,
  SCROLL_FLING_VELOCITY_EPS,
} from "./naturalScrollPropsCore";

export { SCROLL_FLING_VELOCITY_EPS };
export {
  buildNaturalHorizontalScrollProps,
  buildNaturalVerticalScrollProps,
  naturalDecelerationRate,
} from "./naturalScrollPropsCore";

export const NATURAL_DECELERATION_RATE = naturalDecelerationRate(Platform.OS);

export const NATURAL_HORIZONTAL_SCROLL_PROPS = buildNaturalHorizontalScrollProps(Platform.OS);

export const NATURAL_VERTICAL_SCROLL_PROPS = buildNaturalVerticalScrollProps(Platform.OS);
