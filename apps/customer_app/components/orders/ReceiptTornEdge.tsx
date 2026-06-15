/** Jagged bottom edge for receipt-style delivery card. */
import { View, StyleSheet } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";

const TAB_COUNT = 36;
const PAGE_BG = GatiMitraColors.softBackground;

type Props = {
  backgroundColor?: string;
};

export function ReceiptTornEdge({ backgroundColor = PAGE_BG }: Props) {
  return (
    <View style={styles.row}>
      {Array.from({ length: TAB_COUNT }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.tab,
            i % 2 === 0 ? styles.tabPeak : styles.tabValley,
            i % 2 !== 0 ? { backgroundColor } : null,
          ]}
        />
      ))}
    </View>
  );
}

const TAB_W = 11;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    overflow: "hidden",
    marginTop: -1,
  },
  tab: {
    width: TAB_W,
    backgroundColor: "#fff",
  },
  tabPeak: {
    height: 10,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 5,
  },
  tabValley: {
    height: 5,
    marginBottom: 5,
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
});
