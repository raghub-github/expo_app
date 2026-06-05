import React from "react";
import {
  View,
  Text,
  Modal,
  Image,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";

const BRAND = colors.primary[600];
const BRAND_DARK = colors.primary[700];
const HEADER_LEFT_WIDTH = 48;
const HEADER_RIGHT_MIN_WIDTH = 96;

type Props = {
  visible: boolean;
  uri: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  onPickAnother: () => void;
};

/**
 * Full-screen photo preview after gallery pick.
 * Header uses fixed-width left/right slots so the title stays centered and both actions stay visible.
 * Footer is outside the preview flex chain so actions are never pushed off-screen.
 */
export function SupportPhotoPreviewModal({
  visible,
  uri,
  onCancel,
  onConfirm,
  onPickAnother,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const doneLabel = t("common.done", "Done");
  const chooseAnotherLabel = t("profile.supportFlow.chooseAnother", "Choose Another");

  if (!visible || !uri) return null;

  const footerBottomPad = Math.max(insets.bottom, 12);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <SafeAreaView style={styles.main} edges={["top", "left", "right"]}>
          <View style={styles.header}>
            <View style={styles.headerSlotLeft}>
              <Pressable
                onPress={onCancel}
                style={({ pressed }) => [styles.headerIconBtn, pressed && styles.pressed]}
                accessibilityLabel={t("common.cancel", "Cancel")}
                hitSlop={8}
              >
                <Ionicons name="close" size={24} color="#0F172A" />
              </Pressable>
            </View>

            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle} numberOfLines={1}>
                {t("profile.supportFlow.previewPhoto", "Preview photo")}
              </Text>
            </View>

            <View style={styles.headerSlotRight}>
              <Pressable
                onPress={onConfirm}
                style={({ pressed }) => [styles.headerDoneBtn, pressed && styles.pressed]}
                accessibilityLabel={doneLabel}
                hitSlop={8}
              >
                <View style={styles.inlineRow}>
                  <Ionicons name="checkmark-circle" size={18} color={BRAND_DARK} />
                  <Text style={styles.headerDoneText} numberOfLines={1}>
                    {doneLabel}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View style={styles.previewWrap}>
            <Image source={{ uri }} style={styles.previewImage} resizeMode="cover" />
          </View>
        </SafeAreaView>

        <View style={[styles.footer, { paddingBottom: footerBottomPad }]}>
          <Pressable
            onPress={onPickAnother}
            style={({ pressed }) => [styles.footerBtnSecondary, pressed && styles.pressed]}
            accessibilityLabel={chooseAnotherLabel}
          >
            <View style={styles.inlineRow}>
              <Ionicons name="images-outline" size={18} color={BRAND} />
              <Text
                style={styles.footerBtnSecondaryText}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {chooseAnotherLabel}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [styles.footerBtnPrimary, pressed && styles.pressed]}
            accessibilityLabel={doneLabel}
          >
            <Text style={styles.footerBtnPrimaryText} numberOfLines={1}>
              {doneLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const FOOTER_BTN_HEIGHT = 52;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  main: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    minHeight: 56,
    flexShrink: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    zIndex: 2,
    ...Platform.select({
      android: { elevation: 4 },
      default: {},
    }),
  },
  headerSlotLeft: {
    width: HEADER_LEFT_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerSlotRight: {
    minWidth: HEADER_RIGHT_MIN_WIDTH,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    paddingLeft: 4,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "nowrap",
    flexShrink: 0,
    gap: 6,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  headerDoneBtn: {
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    borderWidth: 1.5,
    borderColor: BRAND,
    alignSelf: "center",
    justifyContent: "center",
  },
  headerDoneText: {
    fontSize: 14,
    fontWeight: "800",
    color: BRAND_DARK,
    flexShrink: 0,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  previewWrap: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: "#0F172A",
    overflow: "hidden",
  },
  previewImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  footer: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    zIndex: 2,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      default: {},
    }),
  },
  footerBtnSecondary: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: FOOTER_BTN_HEIGHT,
    marginRight: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BRAND,
    backgroundColor: colors.primary[50],
    paddingHorizontal: 10,
  },
  footerBtnSecondaryText: {
    fontSize: 13,
    fontWeight: "700",
    color: BRAND,
    flexShrink: 0,
  },
  footerBtnPrimary: {
    flex: 1,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
    height: FOOTER_BTN_HEIGHT,
    marginLeft: 6,
    borderRadius: 12,
    backgroundColor: BRAND,
    borderWidth: 1,
    borderColor: BRAND_DARK,
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  footerBtnPrimaryText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  pressed: { opacity: 0.88 },
});
