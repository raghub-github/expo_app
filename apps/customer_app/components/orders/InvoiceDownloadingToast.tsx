/**
 * Mint-green downloading pill with GatiMitra logo (order invoice fetch).
 */

import { View, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { AppText } from "@/components/AppText";

import { GatiMitraColors } from "@/constants/gatimitra";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

type Props = {
  visible: boolean;
  message?: string;
};

export function InvoiceDownloadingToast({ visible, message = "Downloading invoice…" }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop} pointerEvents="none">
        <View style={styles.pill}>
          <AppAssetImage assetKey={CX.orders.toastLogo} style={styles.logo} contentFit="contain" />
          <ActivityIndicator size="small" color={GatiMitraColors.deepMintStart} />
          <AppText style={styles.text}>{message}</AppText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 120,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#E8F8F0",
    borderWidth: 1,
    borderColor: GatiMitraColors.primaryMint,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    shadowColor: GatiMitraColors.deepMintStart,
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  logo: {
    width: 22,
    height: 22,
    borderRadius: 6,
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraColors.deepMintStart,
  },
});
