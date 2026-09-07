import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  slogan?: string;
  dark?: boolean;
};

/**
 * Plane listing loader — header stays real; body is slogan + spinner only.
 * No category dots, chips, or shimmer bars.
 */
export function FoodHomeListingSkeleton({
  slogan = "Looking for great food near you",
  dark = false,
}: Props) {
  return (
    <View style={[styles.root, dark && styles.rootDark]}>
      <AppText style={[styles.slogan, dark && styles.sloganDark]}>{slogan}</AppText>
      <ActivityIndicator
        size="large"
        color={dark ? "#86EFAC" : GatiMitraColors.primaryMint}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 220,
    paddingTop: 36,
    paddingBottom: 48,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 36,
  },
  rootDark: {
    backgroundColor: "transparent",
  },
  slogan: {
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
    color: "#94A3B8",
  },
  sloganDark: {
    color: "#94A3B8",
  },
  spinner: {
    marginTop: 18,
  },
});
