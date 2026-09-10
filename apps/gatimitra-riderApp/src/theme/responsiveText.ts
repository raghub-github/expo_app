/**
 * Shared text/row helpers for responsive Rider UI.
 */

import { StyleSheet, type TextProps, type TextStyle } from "react-native";

/** Apply to Text in tight rows — prevents overflow without disabling font scale. */
export const responsiveTextProps: Pick<TextProps, "numberOfLines" | "ellipsizeMode"> = {
  numberOfLines: 1,
  ellipsizeMode: "tail",
};

export const responsiveMultilineProps: Pick<TextProps, "numberOfLines" | "ellipsizeMode"> = {
  numberOfLines: 3,
  ellipsizeMode: "tail",
};

/** Row child that should shrink when space is tight. */
export const flexShrinkText: TextStyle = {
  flexShrink: 1,
  minWidth: 0,
};

export const rowLayout = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "100%",
  },
  rowStart: {
    flexDirection: "row",
    alignItems: "flex-start",
    maxWidth: "100%",
  },
  grow: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
  },
  noShrink: {
    flexShrink: 0,
  },
});
