/**
 * Prohibited items bottom sheet for parcel booking.
 */

import { View, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const ITEMS: { icon: keyof typeof Ionicons.glyphMap; title: string }[] = [
  { icon: "wine-outline", title: "Tobacco, alcohol, narcotics, and illegal drugs" },
  { icon: "flash-outline", title: "Firearms, explosives, and fire extinguishers" },
  { icon: "flame-outline", title: "Flammable goods, hazardous items, and dry ice" },
  { icon: "cash-outline", title: "Cash, coins, jewellery, precious stones and sensitive documents" },
  { icon: "paw-outline", title: "Human organs, and animals" },
  { icon: "game-controller-outline", title: "Gambling devices, lottery tickets, and adult material" },
];

export function ParcelProhibitedItemsBottomSheet({ visible, onClose }: Props) {
  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.78}>
      <View style={styles.handle} />
      <AppText style={styles.title}>Prohibited items</AppText>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {ITEMS.map((item) => (
          <View key={item.title} style={styles.row}>
            <View style={styles.banWrap}>
              <Ionicons name="ban" size={22} color="#EA580C" />
            </View>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon} size={26} color="#334155" />
            </View>
            <AppText style={styles.rowText}>{item.title}</AppText>
          </View>
        ))}
        <AppText style={styles.note}>
          Note: This is not an exhaustive list. GatiMitra reserves the right to refuse delivery of
          any item that is illegal, unsafe, hazardous, or violates applicable laws or company
          policies.
        </AppText>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 8,
    marginBottom: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  list: {
    maxHeight: 420,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  banWrap: {
    width: 28,
    alignItems: "center",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    lineHeight: 20,
  },
  note: {
    marginTop: 8,
    fontSize: 11,
    color: "#64748B",
    lineHeight: 16,
  },
});
