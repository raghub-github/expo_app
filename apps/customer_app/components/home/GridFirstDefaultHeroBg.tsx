/**
 * Swiggy-style cream patterned backdrop for grid_first hero
 * when admin has not uploaded state hero media.
 */

import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

export const GRID_FIRST_DEFAULT_HERO_BASE = "#FFF4E8";
export const GRID_FIRST_DEFAULT_HERO_MID = "#FFE8D1";
export const GRID_FIRST_DEFAULT_HERO_DEEP = "#F5D5B8";

type Props = {
  style?: object;
};

/** Soft gold/cream field + faint geometric dots — matches Swiggy Gold strip energy. */
export function GridFirstDefaultHeroBg({ style }: Props) {
  return (
    <View style={[styles.root, style]} pointerEvents="none">
      <LinearGradient
        colors={[GRID_FIRST_DEFAULT_HERO_BASE, GRID_FIRST_DEFAULT_HERO_MID, GRID_FIRST_DEFAULT_HERO_DEEP]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} preserveAspectRatio="none">
        <Defs>
          <Pattern id="gmHeroDots" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
            <Circle cx="4" cy="4" r="1.4" fill="rgba(180, 120, 60, 0.14)" />
            <Circle cx="18" cy="16" r="1.1" fill="rgba(180, 120, 60, 0.1)" />
          </Pattern>
          <Pattern id="gmHeroWaves" x="0" y="0" width="64" height="40" patternUnits="userSpaceOnUse">
            <Rect x="0" y="18" width="64" height="1.2" fill="rgba(196, 140, 70, 0.08)" />
            <Rect x="0" y="30" width="64" height="1" fill="rgba(196, 140, 70, 0.06)" />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#gmHeroDots)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#gmHeroWaves)" />
      </Svg>
      <LinearGradient
        colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0)", "rgba(0,0,0,0.06)"]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
    backgroundColor: GRID_FIRST_DEFAULT_HERO_BASE,
  },
});
