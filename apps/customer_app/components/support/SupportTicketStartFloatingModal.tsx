/**
 * FAB-triggered floating card — Join Our Groups style (UI only shell).
 */
import React from "react";
import {
  Modal,
  View,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";

type SupportTicketStartFloatingModalProps = {
  visible: boolean;
  onClose: () => void;
  onAboutOrder: () => void;
  onNotAboutOrder: () => void;
  /** Distance from bottom of screen to anchor modal above FAB (px). */
  bottomOffset?: number;
};

type ChoiceRowProps = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

function ChoiceRow({ icon, iconColor, iconBg, title, subtitle, onPress }: ChoiceRowProps) {
  return (
    <TouchableOpacity style={styles.choiceRow} activeOpacity={0.85} onPress={onPress}>
      <View style={[styles.choiceIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={styles.choiceBody}>
        <AppText style={styles.choiceTitle}>{title}</AppText>
        <AppText style={styles.choiceSub} numberOfLines={2}>
          {subtitle}
        </AppText>
      </View>
    </TouchableOpacity>
  );
}

export function SupportTicketStartFloatingModal({
  visible,
  onClose,
  onAboutOrder,
  onNotAboutOrder,
  bottomOffset = 88,
}: SupportTicketStartFloatingModalProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 24, 360);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <View style={[styles.anchor, { bottom: bottomOffset, width: cardWidth }]}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Ionicons name="chatbubbles" size={16} color={GatiMitraColors.emerald} />
                </View>
                <View style={styles.headerText}>
                  <AppText style={styles.headerTitle}>Raise a ticket</AppText>
                  <AppText style={styles.headerSub}>Order issue · General help</AppText>
                </View>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={10}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <AppText style={styles.lead}>
              Tell us if your issue is about a specific order so we can pull up the details.
            </AppText>

            <View style={styles.choices}>
              <ChoiceRow
                icon="receipt"
                iconColor="#dc2626"
                iconBg="rgba(220, 38, 38, 0.14)"
                title="About an order"
                subtitle="Cancel, refund, damaged, delay, missing item…"
                onPress={onAboutOrder}
              />
              <ChoiceRow
                icon="help-circle"
                iconColor="#1d4ed8"
                iconBg="rgba(29, 78, 216, 0.14)"
                title="Not about an order"
                subtitle="Account, payments, app issues, feedback…"
                onPress={onNotAboutOrder}
              />
            </View>

            <AppText style={styles.footer}>Pick one to continue — you can add photos in chat later.</AppText>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  anchor: {
    position: "absolute",
    right: 12,
    alignSelf: "flex-end",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimaryNew,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 10,
    fontFamily: StoreFonts.poppinsSemiBold,
    color: GatiMitraColors.textSecondary,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  lead: {
    fontSize: 12,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textSecondary,
    lineHeight: 18,
    marginBottom: 12,
  },
  choices: {
    gap: 8,
  },
  choiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  choiceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceBody: { flex: 1, minWidth: 0 },
  choiceTitle: {
    fontSize: 14,
    fontFamily: StoreFonts.loraBold,
    color: GatiMitraColors.textPrimaryNew,
  },
  choiceSub: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textSecondary,
    lineHeight: 15,
  },
  footer: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 11,
    fontFamily: StoreFonts.loraRegular,
    color: GatiMitraColors.textSecondary,
  },
});
