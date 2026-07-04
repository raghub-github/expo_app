import React from "react";

import { View, StyleSheet, Platform, Pressable } from "react-native";

import Animated from "react-native-reanimated";

import { Ionicons } from "@expo/vector-icons";

import {

  MERCHANT_HEADER_TOP_GUTTER,

  STICKY_SEARCH_ROW_HEIGHT,

  STICKY_SEARCH_WRAP_PADDING_BOTTOM,

} from "../constants/layout";

import { StoreTheme } from "@/constants/storeTheme";

import { GatiMitraColors } from "@/constants/gatimitra";



export type MerchantStickyChromeProps = {

  topGutter?: number;

  stickySearchStyle: object;

  stickySearchBgStyle: object;

  searchRow: React.ReactNode;

  pointerEvents: "auto" | "box-none" | "none";

  stickySearchActive: boolean;

  headerSearchExpanded: boolean;

  onBack: () => void;

};



/** Sticky search bar only — filter row stays in scroll content, not duplicated on scroll. */

export const MerchantStickyChrome = React.memo(function MerchantStickyChrome({

  topGutter = MERCHANT_HEADER_TOP_GUTTER,

  stickySearchStyle,

  stickySearchBgStyle,

  searchRow,

  pointerEvents,

  stickySearchActive,

  headerSearchExpanded,

  onBack,

}: MerchantStickyChromeProps) {

  const stickySearchPointerEvents =

    headerSearchExpanded || stickySearchActive ? "auto" : "box-none";



  return (

    <View style={styles.root} pointerEvents={pointerEvents}>

      <Animated.View

        style={[styles.searchWrap, { paddingTop: topGutter }, stickySearchStyle]}

        pointerEvents={stickySearchPointerEvents}

      >

        <Animated.View style={[StyleSheet.absoluteFill, styles.searchBg, stickySearchBgStyle]} />

        <View style={styles.searchRowInner} pointerEvents="box-none">

          <Pressable

            onPress={onBack}

            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}

            hitSlop={12}

            accessibilityRole="button"

            accessibilityLabel="Go back"

          >

            <Ionicons name="chevron-back" size={22} color={StoreTheme.textPrimary} />

          </Pressable>

          {searchRow}

        </View>

      </Animated.View>

    </View>

  );

});



const styles = StyleSheet.create({

  root: {

    position: "absolute",

    left: 0,

    right: 0,

    top: 0,

    zIndex: 20,

  },

  searchWrap: {

    position: "relative",

    paddingHorizontal: 12,

    paddingBottom: STICKY_SEARCH_WRAP_PADDING_BOTTOM,

    minHeight: STICKY_SEARCH_ROW_HEIGHT + STICKY_SEARCH_WRAP_PADDING_BOTTOM,

    ...Platform.select({

      android: { elevation: 4 },

      ios: GatiMitraColors.elevationShadow as object,

    }),

  },

  searchBg: {

    backgroundColor: "#fff",

  },

  searchRowInner: {

    zIndex: 1,

    minHeight: STICKY_SEARCH_ROW_HEIGHT,

    flexDirection: "row",

    alignItems: "center",

    gap: 10,

  },

  backBtn: {

    width: 36,

    height: 36,

    borderRadius: 18,

    backgroundColor: StoreTheme.searchBg,

    alignItems: "center",

    justifyContent: "center",

  },

  backBtnPressed: {

    opacity: 0.82,

  },

});


