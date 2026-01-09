import React from "react";
import { View, Image, StyleSheet, ViewStyle, ImageStyle } from "react-native";

export interface LogoProps {
  /**
   * Size of the logo. Default is 'medium'.
   * - 'small': width 120px
   * - 'medium': width 180px
   * - 'large': width 240px
   * - 'xlarge': width 300px
   */
  size?: "small" | "medium" | "large" | "xlarge";
  /**
   * Show only the icon (logo without text) - uses onlylogo.png
   */
  iconOnly?: boolean;
  /**
   * Custom style for the container
   */
  style?: ViewStyle;
  /**
   * Show text below icon instead of beside it (for iconOnly=false)
   */
  vertical?: boolean;
}

const sizeConfig = {
  small: {
    width: 120,
  },
  medium: {
    width: 180,
  },
  large: {
    width: 240,
  },
  xlarge: {
    width: 300,
  },
};

/**
 * GatiMitra Logo Component
 * 
 * Displays the actual GatiMitra logo image (logo.png or onlylogo.png)
 * - Uses logo.png for full logo with text
 * - Uses onlylogo.png when iconOnly=true
 * - Maintains aspect ratio automatically
 */
export function Logo({ 
  size = "medium", 
  iconOnly = false, 
  style,
  vertical = false 
}: LogoProps) {
  const config = sizeConfig[size];

  const containerStyle: ViewStyle = {
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };

  const imageStyle: ImageStyle = {
    width: config.width,
    height: undefined,
    resizeMode: "contain",
  };

  return (
    <View style={containerStyle}>
      <Image
        source={iconOnly 
          ? require("../../assets/images/onlylogo.png")
          : require("../../assets/images/logo.png")
        }
        style={imageStyle}
        resizeMode="contain"
      />
    </View>
  );
}

