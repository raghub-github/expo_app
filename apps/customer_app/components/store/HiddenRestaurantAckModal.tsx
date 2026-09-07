import { Modal, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";

type Props = {
  visible: boolean;
  hidden: boolean;
  onDismiss: () => void;
};

export function HiddenRestaurantAckModal({ visible, hidden, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.dim} onPress={onDismiss}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={hidden ? "eye-off-outline" : "eye-outline"}
              size={36}
              color={StoreTheme.accentRed}
            />
          </View>
          <AppText style={styles.title}>
            {hidden
              ? "This restaurant is now hidden from your feed"
              : "This restaurant will now be visible in your feed"}
          </AppText>
          <AppText style={styles.body}>
            {hidden
              ? "You can unhide it again from the more button at the top of the menu"
              : "You can hide it again from the more button at the top of the menu"}
          </AppText>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <AppText style={styles.gotIt}>Got it!</AppText>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
  },
  iconWrap: {
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#1C1C1C",
    textAlign: "center",
    lineHeight: 24,
  },
  body: {
    marginTop: 8,
    fontSize: 13,
    color: "#696969",
    textAlign: "center",
    lineHeight: 18,
  },
  gotIt: {
    marginTop: 16,
    fontSize: 15,
    fontWeight: "800",
    color: StoreTheme.accentRed,
  },
});
