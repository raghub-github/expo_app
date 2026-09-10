import React, { memo, useState } from "react";
import { View, Image, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const PIN = "#EA580C";
const PIN_CLOSED = "#9CA3AF";

/** Pin footprint — Mapbox MarkerView anchors at bottom tip. */
export const STORE_MAP_PIN_W = 40;
export const STORE_MAP_PIN_H = 48;

type Props = {
  bannerUrl?: string | null;
  isOpen?: boolean;
  name?: string;
};

/**
 * Nearby-store map pin: sharp tip + small circular banner with saffron outline.
 * Images are tiny + cached by the OS; failed loads fall back without remount churn.
 */
export const StoreMapPin = memo(function StoreMapPin({
  bannerUrl,
  isOpen = true,
}: Props) {
  const [failed, setFailed] = useState(false);
  const tipColor = isOpen ? PIN : PIN_CLOSED;
  const uri = typeof bannerUrl === "string" ? bannerUrl.trim() : "";
  const showImage = uri.length > 0 && !failed;

  return (
    <View style={styles.wrap} pointerEvents="none" collapsable={false}>
      <View style={styles.ring}>
        {showImage ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={[styles.fallback, { backgroundColor: tipColor }]}>
            <Ionicons name="storefront" size={16} color="#ffffff" />
          </View>
        )}
      </View>
      <View style={[styles.tip, { borderTopColor: tipColor }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    width: STORE_MAP_PIN_W,
    height: STORE_MAP_PIN_H,
    alignItems: "center",
    justifyContent: "flex-start",
    overflow: "visible",
  },
  ring: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: PIN,
    backgroundColor: "#ffffff",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  /** Sharp pin tip under the circle. */
  tip: {
    width: 0,
    height: 0,
    marginTop: -2,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 12,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
