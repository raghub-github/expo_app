import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";

export type StoreMenuSheetSection = {
  id: string;
  title: string;
  count: number;
  /** Pink + suffix after title (category sections). */
  showPlus?: boolean;
};

export type StoreMenuSheetProps = {
  visible: boolean;
  onClose: () => void;
  sections: StoreMenuSheetSection[];
  onSelectSection: (section: StoreMenuSheetSection) => void;
  largeOrderSection?: StoreMenuSheetSection | null;
  fssaiLabel?: string | null;
};

function MenuRow({
  section,
  onPress,
}: {
  section: StoreMenuSheetSection;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {section.title}
        </Text>
        {section.showPlus ? (
          <Text style={styles.plusSuffix}> +</Text>
        ) : null}
      </View>
      <Text style={styles.rowCount}>{section.count}</Text>
    </TouchableOpacity>
  );
}

export function StoreMenuSheet({
  visible,
  onClose,
  sections,
  onSelectSection,
  largeOrderSection,
  fssaiLabel,
}: StoreMenuSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const cardWidth = Math.min(Math.round(winW * 0.88), 400);
  const cardMaxH = Math.round(winH * 0.58);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <View style={[styles.cardWrap, { width: cardWidth, maxHeight: cardMaxH }]}>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {sections.map((section) => (
              <MenuRow
                key={section.id}
                section={section}
                onPress={() => onSelectSection(section)}
              />
            ))}

            {largeOrderSection ? (
              <>
                <View style={styles.divider} />
                <TouchableOpacity
                  style={styles.largeOrderRow}
                  onPress={() => onSelectSection(largeOrderSection)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.largeOrderText}>LARGE ORDER MENU</Text>
                  <Ionicons name="chevron-down" size={16} color={StoreTheme.textPrimary} />
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>

        {fssaiLabel ? (
          <Text style={[styles.fssai, { bottom: Math.max(insets.bottom, 12) + 8 }]} numberOfLines={1}>
            {fssaiLabel}
          </Text>
        ) : null}

        <TouchableOpacity
          style={[styles.closePill, { bottom: Math.max(insets.bottom, 12) }]}
          onPress={onClose}
          activeOpacity={0.88}
        >
          <Ionicons name="close" size={16} color="#fff" />
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  cardWrap: {
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 16 },
    }),
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    gap: 12,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
    lineHeight: 20,
  },
  plusSuffix: {
    fontSize: 15,
    fontWeight: "600",
    color: StoreTheme.accentRed,
  },
  rowCount: {
    fontSize: 15,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
    minWidth: 24,
    textAlign: "right",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: StoreTheme.border,
    marginVertical: 4,
  },
  largeOrderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  largeOrderText: {
    fontSize: 14,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    letterSpacing: 0.3,
  },
  fssai: {
    position: "absolute",
    left: 16,
    fontSize: 10,
    color: StoreTheme.textMuted,
    maxWidth: "58%",
  },
  closePill: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#2D2D32",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    zIndex: 3,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  closeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
});
