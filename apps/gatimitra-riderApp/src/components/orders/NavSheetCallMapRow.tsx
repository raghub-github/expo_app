import React from "react";
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const MAP_BLUE = "#1A73E8";
const CALL_BORDER = "#DADCE0";

type Props = {
  onCall: () => void;
  onMap: () => void;
  callDisabled?: boolean;
  callLabel: string;
  mapLabel: string;
};

export function NavSheetCallMapRow({
  onCall,
  onMap,
  callDisabled,
  callLabel,
  mapLabel,
}: Props) {
  const { width } = useWindowDimensions();
  const horizontalPad = 16;
  const gap = 12;
  const btnWidth = Math.floor((width - horizontalPad * 2 - gap) / 2);

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onCall}
        disabled={callDisabled}
        style={({ pressed }) => [
          styles.callBtn,
          { width: btnWidth, marginRight: gap },
          callDisabled && styles.callBtnDisabled,
          pressed && !callDisabled && styles.callBtnPressed,
        ]}
      >
        <Ionicons
          name="call"
          size={20}
          color={callDisabled ? "#9AA0A6" : MAP_BLUE}
        />
        <Text
          style={[styles.callBtnText, callDisabled && styles.callBtnTextDisabled]}
          numberOfLines={1}
        >
          {callLabel}
        </Text>
      </Pressable>

      <Pressable
        onPress={onMap}
        style={({ pressed }) => [
          styles.mapBtn,
          { width: btnWidth },
          pressed && styles.mapBtnPressed,
        ]}
      >
        <Ionicons name="navigate" size={20} color="#ffffff" />
        <Text style={styles.mapBtnText} numberOfLines={1}>
          {mapLabel}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: CALL_BORDER,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
  },
  callBtnDisabled: {
    opacity: 0.55,
  },
  callBtnPressed: {
    backgroundColor: "#F8F9FA",
  },
  callBtnText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "600",
    color: MAP_BLUE,
  },
  callBtnTextDisabled: {
    color: "#9AA0A6",
  },
  mapBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: MAP_BLUE,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
  },
  mapBtnPressed: {
    opacity: 0.9,
  },
  mapBtnText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: "600",
    color: "#ffffff",
  },
});
