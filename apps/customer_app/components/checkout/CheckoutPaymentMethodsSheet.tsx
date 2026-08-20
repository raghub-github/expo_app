import { useMemo } from "react";
import {
  View,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Text,
  Platform,
  StatusBar as RNStatusBar,
  useWindowDimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CheckoutPaymentMethodLogo } from "@/components/checkout/CheckoutPaymentMethodLogo";
import { formatCheckoutSavingsRupees } from "@/lib/checkoutAppliedSavings";
import type { CheckoutPayMethodItem, CheckoutPayMethodSection } from "@/lib/razorpayPaymentMethods";
import { StoreFonts } from "@/constants/storeTypography";
import { GatiMitraColors } from "@/constants/gatimitra";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import { DEFAULT_STATUS_BAR_HEIGHT } from "@/constants/layout";

type Props = {
  visible: boolean;
  onClose: () => void;
  billTotal: number | null;
  sections: CheckoutPayMethodSection[];
  loading?: boolean;
  loadFailed?: boolean;
  onRetryLoad?: () => void;
  selectedId?: string | null;
  onSelect: (item: CheckoutPayMethodItem) => void;
};

function MethodRow({
  item,
  selected,
  showDivider,
  onPress,
}: {
  item: CheckoutPayMethodItem;
  selected: boolean;
  showDivider: boolean;
  onPress: () => void;
}) {
  const dark = useMerchantUiDark();
  const accent = dark ? MerchantDarkPalette.accent : GatiMitraColors.splashMint;
  const labelColor = dark ? MerchantDarkPalette.text : "#1F2937";
  const chevron = dark ? MerchantDarkPalette.textDim : "#9CA3AF";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={({ pressed }) => [
        styles.rowHit,
        selected && (dark ? styles.rowSelectedDark : styles.rowSelected),
        pressed && styles.rowPressed,
      ]}
    >
      <View style={styles.rowInner}>
        <CheckoutPaymentMethodLogo logoKey={item.logoKey} size={36} />
        <Text style={[styles.rowLabel, { color: labelColor }]} numberOfLines={1}>
          {item.label}
        </Text>
        {item.action === "add" ? (
          <Ionicons name="add" size={22} color={accent} />
        ) : (
          <Ionicons name="chevron-forward" size={18} color={chevron} />
        )}
      </View>
      {showDivider ? <View style={[styles.rowDivider, dark && styles.rowDividerDark]} /> : null}
    </Pressable>
  );
}

export function CheckoutPaymentMethodsSheet({
  visible,
  onClose,
  billTotal,
  sections,
  loading = false,
  loadFailed = false,
  onRetryLoad,
  selectedId,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowH } = useWindowDimensions();
  const dark = useMerchantUiDark();
  const sheetBg = dark ? MerchantDarkPalette.bg : "#F3F4F6";
  const topInset = Math.max(
    insets.top,
    Platform.OS === "android" ? RNStatusBar.currentHeight ?? 0 : 0,
    DEFAULT_STATUS_BAR_HEIGHT
  );
  const totalLabel =
    billTotal != null && Number.isFinite(billTotal)
      ? `₹${formatCheckoutSavingsRupees(billTotal)}`
      : "—";

  const visibleSections = useMemo(
    () => sections.filter((s) => s.items.length > 0),
    [sections]
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar
        style={dark ? "light" : "dark"}
        translucent
        backgroundColor="transparent"
        hidden={false}
      />
      <View
        style={[styles.root, { backgroundColor: sheetBg, minHeight: windowH }]}
        collapsable={false}
      >
        <View style={[styles.header, { paddingTop: topInset }]}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close payment options"
            style={styles.backBtn}
          >
            <Ionicons
              name="arrow-back"
              size={22}
              color={dark ? MerchantDarkPalette.text : "#111827"}
            />
          </Pressable>
          <Text style={[styles.headerTitle, dark && styles.headerTitleDark]} numberOfLines={1}>
            Bill total: {totalLabel}
          </Text>
        </View>

        {loading && visibleSections.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={dark ? MerchantDarkPalette.accent : GatiMitraColors.splashMint} />
            <Text style={[styles.loadingText, dark && styles.mutedDark]}>Loading payment methods…</Text>
          </View>
        ) : loadFailed && visibleSections.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={[styles.loadingText, dark && styles.mutedDark]}>
              Couldn’t load payment methods. Check your connection and retry.
            </Text>
            {onRetryLoad ? (
              <Pressable onPress={onRetryLoad} style={styles.retryBtn}>
                <Text style={styles.retryTxt}>Retry</Text>
              </Pressable>
            ) : null}
          </View>
        ) : visibleSections.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={[styles.loadingText, dark && styles.mutedDark]}>
              No Razorpay payment methods are enabled for this account yet.
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[
              styles.scroll,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {visibleSections.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text style={[styles.sectionTitle, dark && styles.sectionTitleDark]}>
                  {section.title}
                </Text>
                <View style={[styles.card, dark && styles.cardDark]}>
                  {section.items.map((item, idx) => (
                    <MethodRow
                      key={item.id}
                      item={item}
                      selected={selectedId === item.id}
                      showDivider={idx < section.items.length - 1}
                      onPress={() => onSelect(item)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  headerTitle: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 4,
    fontSize: 18,
    fontFamily: StoreFonts.loraBold,
    color: "#111827",
  },
  headerTitleDark: {
    color: MerchantDarkPalette.text,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: StoreFonts.poppinsBold,
    letterSpacing: 0.9,
    color: "#9CA3AF",
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionTitleDark: {
    color: MerchantDarkPalette.textDim,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    overflow: "hidden",
  },
  cardDark: {
    backgroundColor: MerchantDarkPalette.card,
  },
  rowHit: {
    width: "100%",
  },
  rowInner: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    width: "100%",
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: { opacity: 0.72 },
  rowSelected: { backgroundColor: "rgba(19, 114, 67, 0.08)" },
  rowSelectedDark: { backgroundColor: "rgba(45, 212, 191, 0.12)" },
  rowLabel: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    marginLeft: 14,
    marginRight: 8,
    fontSize: 16,
    fontFamily: StoreFonts.loraBold,
  },
  rowDivider: {
    marginLeft: 66,
    marginRight: 16,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  rowDividerDark: {
    backgroundColor: MerchantDarkPalette.border,
  },
  mutedDark: { color: MerchantDarkPalette.textMuted },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: StoreFonts.loraRegular,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 28,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: GatiMitraColors.splashMint,
  },
  retryTxt: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: StoreFonts.poppinsBold,
  },
});
