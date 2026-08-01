import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { StoreTheme } from "@/constants/storeTheme";
import { useCartNoticeStore } from "@/store/cartNoticeStore";

export function CartUpdatedModal() {
  const visible = useCartNoticeStore((state) => state.visible);
  const removedCount = useCartNoticeStore((state) => state.removedCount);
  const dismiss = useCartNoticeStore((state) => state.dismiss);

  const message =
    removedCount === 1
      ? "1 item is no longer available and has been removed from your cart."
      : `${removedCount} items are no longer available and have been removed from your cart.`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={dismiss}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel="Close cart update"
        />
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="cart-outline" size={28} color={StoreTheme.accentMintDark} />
          </View>

          <AppText style={styles.title}>Cart updated</AppText>
          <AppText style={styles.message}>{message}</AppText>

          <Pressable
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <AppText style={styles.buttonText}>Got it</AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.58)",
  },
  card: {
    width: "100%",
    maxWidth: 360,
    alignItems: "center",
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 18,
    zIndex: 2,
    elevation: 14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
  },
  iconWrap: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 29,
    backgroundColor: StoreTheme.accentMintSoft,
    marginBottom: 16,
  },
  title: {
    color: StoreTheme.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  message: {
    color: StoreTheme.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  button: {
    alignSelf: "stretch",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#16A34A",
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.88,
    backgroundColor: "#15803D",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
});
