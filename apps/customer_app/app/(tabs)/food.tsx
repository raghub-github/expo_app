/**
 * Food tab placeholder — navigation to /home is handled in CustomerTabBar.
 */

import { View, StyleSheet } from "react-native";

import { GatiMitraColors } from "@/constants/gatimitra";

export default function FoodTabScreen() {
  return <View style={styles.wrap} />;
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: GatiMitraColors.softBackground,
  },
});
