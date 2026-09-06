/**
 * Play-style “Update available” bottom sheet — brand-colored.
 */
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export type PlayUpdateAvailableSheetProps = {
  visible: boolean;
  appName: string;
  appIcon: ImageSourcePropType;
  versionHint?: string | null;
  primaryColor: string;
  onDismiss: () => void;
  onUpdate: () => void;
  onLearnMore: () => void;
};

export function PlayUpdateAvailableSheet({
  visible,
  appName,
  appIcon,
  versionHint,
  primaryColor,
  onDismiss,
  onUpdate,
  onLearnMore,
}: PlayUpdateAvailableSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  // Insets inside an Android RN Modal are frequently 0, so floor the bottom padding to clear
  // the system navigation/gesture bar; otherwise the pinned action row hides behind it.
  const bottomPad = Math.max(insets.bottom, 24);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Dismiss" />
        {/* maxHeight caps the sheet to the viewport; the scrollable body + a PINNED action row
            guarantee the Update button is always visible/tappable on every device & font scale
            (the previous single-column layout let large fonts / the nav bar push it off-screen). */}
        <View
          style={[
            styles.sheet,
            { maxHeight: Math.round(screenHeight * 0.9), paddingBottom: bottomPad },
          ]}
        >
          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.topRow}>
              <View style={styles.brandRow}>
                <View style={[styles.playDot, { backgroundColor: primaryColor }]} />
                <Text style={styles.brandText}>Google Play</Text>
              </View>
              <Pressable
                onPress={onDismiss}
                hitSlop={12}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#E2E8F0" />
              </Pressable>
            </View>

            <Text style={styles.title} maxFontSizeMultiplier={1.3}>
              Update available
            </Text>
            <Text style={styles.body} maxFontSizeMultiplier={1.4}>
              To use this app, download the latest version. You can keep using this app while
              downloading the update.
            </Text>

            <View style={styles.appRow}>
              <Image source={appIcon} style={styles.appIcon} resizeMode="contain" />
              <View style={styles.appMeta}>
                <Text style={styles.appName} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                  {appName}
                </Text>
                {versionHint ? (
                  <Text style={styles.appSub} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                    {versionHint}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.whatsNewRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.whatsNewLabel} maxFontSizeMultiplier={1.3}>
                  What&apos;s new
                </Text>
                <Text style={styles.whatsNewDate} maxFontSizeMultiplier={1.3}>
                  New version available on Google Play
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color="#94A3B8" />
            </View>
          </ScrollView>

          {/* Pinned action row — never scrolls off screen. */}
          <View style={styles.actions}>
            <Pressable
              onPress={onLearnMore}
              style={({ pressed }) => [styles.learnBtn, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel="Learn more"
            >
              <Text style={styles.learnText} maxFontSizeMultiplier={1.3}>
                Learn more
              </Text>
            </Pressable>
            <Pressable
              onPress={onUpdate}
              style={({ pressed }) => [
                styles.updateBtn,
                { backgroundColor: primaryColor },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Update"
            >
              <Text style={styles.updateText} maxFontSizeMultiplier={1.3}>
                Update
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: "#1A1D21",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 16,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.35,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: -4 },
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  // flexShrink lets the scroll area give up height (up to the sheet maxHeight) so the pinned
  // actions below always fit; flexGrow:0 keeps the sheet hugging its content when it's short.
  scrollArea: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 4 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  playDot: { width: 18, height: 18, borderRadius: 4 },
  brandText: { color: "#F8FAFC", fontSize: 14, fontWeight: "600" },
  closeBtn: { padding: 4 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "700", marginBottom: 10 },
  body: { color: "#CBD5E1", fontSize: 14, lineHeight: 21, marginBottom: 20 },
  appRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 18 },
  appIcon: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#0F172A" },
  appMeta: { flex: 1, minWidth: 0 },
  appName: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  appSub: { color: "#94A3B8", fontSize: 12, marginTop: 4 },
  whatsNewRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    marginBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: "#334155",
  },
  whatsNewLabel: { color: "#F8FAFC", fontSize: 14, fontWeight: "600" },
  whatsNewDate: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", gap: 12, paddingTop: 6 },
  learnBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    paddingVertical: 14,
    alignItems: "center",
  },
  learnText: { color: "#F8FAFC", fontSize: 15, fontWeight: "700" },
  updateBtn: { flex: 1, borderRadius: 999, paddingVertical: 14, alignItems: "center" },
  updateText: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.88 },
});
