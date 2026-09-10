import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { flexShrinkText } from "@/src/theme/responsiveText";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function CallOnlyIfRequiredIcon() {
  return (
    <View style={styles.iconStage}>
      <View style={styles.phoneCircle}>
        <MaterialCommunityIcons name="phone" size={30} color="#1A73E8" />
      </View>
      <View style={styles.prohibitRing}>
        <View style={styles.prohibitSlash} />
      </View>
    </View>
  );
}

export function CustomerCallConfirmModal({ visible, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const { height, isShortHeight } = useResponsiveLayout();
  const cardMaxH = Math.round(height * (isShortHeight ? 0.7 : 0.78));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable
          style={[styles.card, { maxHeight: cardMaxH }]}
          onPress={(e) => e.stopPropagation()}
        >
          <ResponsiveSheetBody
            maxHeight={cardMaxH - 16}
            contentContainerStyle={styles.bodyContent}
            footerStyle={styles.footerSlot}
            footer={
              <>
                <Pressable style={styles.callBtn} onPress={onConfirm}>
                  <Text style={styles.callBtnText} numberOfLines={1}>
                    {t("orders.customerCallConfirm.call", "Call")}
                  </Text>
                </Pressable>
                <Pressable onPress={onCancel} style={styles.skipBtn}>
                  <Text style={styles.skipText} numberOfLines={1}>
                    {t("orders.customerCallConfirm.dontCall", "Don't call")}
                  </Text>
                </Pressable>
              </>
            }
          >
            <CallOnlyIfRequiredIcon />
            <Text style={[styles.title, flexShrinkText]} numberOfLines={isShortHeight ? 3 : 4}>
              {t("orders.customerCallConfirm.title", "Please call only if required")}
            </Text>
          </ResponsiveSheetBody>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const ICON_SIZE = 76;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    paddingTop: 12,
    paddingBottom: 10,
    alignItems: "stretch",
    overflow: "hidden",
    flexShrink: 1,
    minHeight: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  bodyContent: {
    alignItems: "center",
    paddingTop: 16,
    paddingHorizontal: 24,
  },
  footerSlot: {
    borderTopWidth: 0,
    backgroundColor: "transparent",
    gap: 0,
    paddingHorizontal: 24,
  },
  iconStage: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    alignSelf: "center",
  },
  phoneCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  prohibitRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ICON_SIZE / 2,
    borderWidth: 3,
    borderColor: "#E53935",
    alignItems: "center",
    justifyContent: "center",
  },
  prohibitSlash: {
    position: "absolute",
    width: ICON_SIZE - 10,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#E53935",
    transform: [{ rotate: "-45deg" }],
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1C1C1C",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
    paddingHorizontal: 4,
    alignSelf: "stretch",
  },
  callBtn: {
    alignSelf: "stretch",
    backgroundColor: colors.success[600],
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 14,
  },
  callBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  skipBtn: {
    paddingVertical: 6,
    alignItems: "center",
  },
  skipText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.success[600],
  },
});
