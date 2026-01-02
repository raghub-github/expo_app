import React from "react";
import { View, Text, StyleSheet, ViewStyle, TextStyle } from "react-native";
import { colors } from "@/src/theme";

export interface LogoProps {
  /**
   * Size of the logo. Default is 'medium'.
   * - 'small': 120x40 (icon: 40x40, text: 14px)
   * - 'medium': 180x60 (icon: 60x60, text: 20px)
   * - 'large': 240x80 (icon: 80x80, text: 28px)
   * - 'xlarge': 300x100 (icon: 100x100, text: 36px)
   */
  size?: "small" | "medium" | "large" | "xlarge";
  /**
   * Show only the icon (circular graphic) without text
   */
  iconOnly?: boolean;
  /**
   * Custom style for the container
   */
  style?: ViewStyle;
  /**
   * Show text below icon instead of beside it
   */
  vertical?: boolean;
}

const sizeConfig = {
  small: {
    iconSize: 40,
    fontSize: 14,
    spacing: 8,
  },
  medium: {
    iconSize: 60,
    fontSize: 20,
    spacing: 12,
  },
  large: {
    iconSize: 80,
    fontSize: 28,
    spacing: 16,
  },
  xlarge: {
    iconSize: 100,
    fontSize: 36,
    spacing: 20,
  },
};

/**
 * GatiMitra Logo Component
 * 
 * Displays the GatiMitra logo with:
 * - Circular graphic with orange (upper) and mint green (lower) sections
 * - Checkmark/leaf shape in mint green
 * - Text "GatiMitra" with "Gati" in mint green and "Mitra" in orange
 * - Transparent background
 * - Fixed aspect ratio (3:1 for horizontal, 1:1.2 for vertical)
 */
export function Logo({ 
  size = "medium", 
  iconOnly = false, 
  style,
  vertical = false 
}: LogoProps) {
  const config = sizeConfig[size];
  const iconRadius = config.iconSize / 2;

  // Calculate checkmark/leaf path points based on icon size
  const checkmarkPoints = {
    startX: iconRadius * 0.3,
    startY: iconRadius * 0.7,
    midX: iconRadius * 0.5,
    midY: iconRadius * 0.5,
    endX: iconRadius * 0.75,
    endY: iconRadius * 0.25,
    curveX: iconRadius * 0.65,
    curveY: iconRadius * 0.35,
  };

  const containerStyle: ViewStyle = {
    flexDirection: vertical ? "column" : "row",
    alignItems: "center",
    justifyContent: "center",
    ...(vertical ? { width: config.iconSize } : { height: config.iconSize }),
  };

  return (
    <View style={[containerStyle, style]}>
      {/* Circular Icon */}
      <View
        style={[
          styles.iconContainer,
          {
            width: config.iconSize,
            height: config.iconSize,
            borderRadius: iconRadius,
          },
        ]}
      >
        {/* Upper Orange Arc */}
        <View
          style={[
            styles.upperArc,
            {
              width: config.iconSize,
              height: iconRadius,
              backgroundColor: colors.brandOrange[500],
              borderTopLeftRadius: iconRadius,
              borderTopRightRadius: iconRadius,
            },
          ]}
        />

        {/* Lower Mint Green Arc */}
        <View
          style={[
            styles.lowerArc,
            {
              width: config.iconSize,
              height: iconRadius,
              backgroundColor: colors.primary[500],
              borderBottomLeftRadius: iconRadius,
              borderBottomRightRadius: iconRadius,
            },
          ]}
        />

        {/* Checkmark/Leaf Shape - Stylized checkmark that curves upward */}
        <View
          style={[
            styles.checkmarkContainer,
            {
              width: config.iconSize,
              height: config.iconSize,
            },
          ]}
        >
          {/* Main checkmark stroke - curved upward */}
          <View
            style={[
              styles.checkmarkMain,
              {
                width: iconRadius * 0.6,
                height: iconRadius * 0.15,
                backgroundColor: colors.primary[500],
                left: iconRadius * 0.3,
                top: iconRadius * 0.5,
                transform: [{ rotate: "-30deg" }],
                borderTopLeftRadius: iconRadius * 0.1,
                borderBottomRightRadius: iconRadius * 0.1,
              },
            ]}
          />
          {/* Checkmark tip - curves to the right */}
          <View
            style={[
              styles.checkmarkTip,
              {
                width: iconRadius * 0.4,
                height: iconRadius * 0.12,
                backgroundColor: colors.primary[500],
                left: iconRadius * 0.55,
                top: iconRadius * 0.4,
                transform: [{ rotate: "25deg" }],
                borderTopRightRadius: iconRadius * 0.1,
                borderBottomLeftRadius: iconRadius * 0.1,
              },
            ]}
          />
        </View>
      </View>

      {/* Text Logo */}
      {!iconOnly && (
        <View
          style={[
            styles.textContainer,
            vertical
              ? { marginTop: config.spacing }
              : { marginLeft: config.spacing },
          ]}
        >
          <Text
            style={[
              styles.text,
              {
                fontSize: config.fontSize,
                color: colors.primary[500],
              },
            ]}
          >
            Gati
          </Text>
          <Text
            style={[
              styles.text,
              {
                fontSize: config.fontSize,
                color: colors.brandOrange[500],
              },
            ]}
          >
            Mitra
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  iconContainer: {
    position: "relative",
    overflow: "hidden",
  },
  upperArc: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  lowerArc: {
    position: "absolute",
    bottom: 0,
    left: 0,
  },
  checkmarkContainer: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  checkmarkMain: {
    position: "absolute",
  },
  checkmarkTip: {
    position: "absolute",
  },
  textContainer: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  text: {
    fontWeight: "700",
    letterSpacing: 0.5,
  },
});

