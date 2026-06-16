import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND_GREEN = "#2E7D32";
const BRAND_GREEN_LIGHT = "#E8F5E9";
const BRAND_GREEN_SOFT = "#C8E6C9";
const OTP_ACCENT = "#F9A825";
const OTP_ACCENT_LIGHT = "#FFF8E1";
const CONTENT_PAD = 16;

type Props = {
  visible: boolean;
  barcodeEnabled?: boolean;
  otpEnabled?: boolean;
  onBack: () => void;
  onScanBarcode: () => void;
  onEnterOtp: () => void;
};

type FeatureTag = {
  icon: keyof typeof Ionicons.glyphMap;
  labelKey: string;
  fallback: string;
};

const BARCODE_TAGS: FeatureTag[] = [
  { icon: "flash-outline", labelKey: "orders.activeFood.verifyTagFast", fallback: "Fast" },
  { icon: "shield-checkmark-outline", labelKey: "orders.activeFood.verifyTagSecure", fallback: "Secure" },
  { icon: "checkmark-circle-outline", labelKey: "orders.activeFood.verifyTagEasy", fallback: "Easy" },
];

const OTP_TAGS: FeatureTag[] = [
  { icon: "shield-checkmark-outline", labelKey: "orders.activeFood.verifyTagSecure", fallback: "Secure" },
  { icon: "person-outline", labelKey: "orders.activeFood.verifyTagSimple", fallback: "Simple" },
  { icon: "checkmark-done-outline", labelKey: "orders.activeFood.verifyTagReliable", fallback: "Reliable" },
];

function FeatureTags({ tags }: { tags: FeatureTag[] }) {
  const { t } = useTranslation();
  return (
    <View style={styles.tagRow}>
      {tags.map((tag) => (
        <View key={tag.fallback} style={styles.tagPill}>
          <Ionicons name={tag.icon} size={12} color={BRAND_GREEN} />
          <Text style={styles.tagText}>{t(tag.labelKey, tag.fallback)}</Text>
        </View>
      ))}
    </View>
  );
}

function BarcodeIllustration() {
  return (
    <View style={styles.illusWrap}>
      <View style={styles.scanBracketTL} />
      <View style={styles.scanBracketTR} />
      <View style={styles.scanBracketBL} />
      <View style={styles.scanBracketBR} />
      <View style={styles.phoneMock}>
        <View style={styles.qrGrid}>
          {Array.from({ length: 9 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.qrCell,
                (i === 0 || i === 2 || i === 6 || i === 8) && styles.qrCellDark,
              ]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

function OtpIllustration() {
  return (
    <View style={[styles.illusWrap, styles.otpIllusWrap]}>
      <Ionicons name="lock-closed" size={28} color={OTP_ACCENT} />
      <View style={styles.otpDots}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.otpDot} />
        ))}
      </View>
    </View>
  );
}

export function FoodPickupVerificationScreen({
  visible,
  barcodeEnabled = true,
  otpEnabled = true,
  onBack,
  onScanBarcode,
  onEnterOtp,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, Platform.OS === "android" ? 8 : 4);
  const bottomPad = Math.max(insets.bottom, Platform.OS === "android" ? 8 : 4);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onBack}>
      <View style={styles.root}>
        <View style={[styles.header, { paddingTop: topPad }]}>
          <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={BRAND_GREEN} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>
              {t("orders.activeFood.verifyPickupTitle", "Verify Pickup")}
            </Text>
            <View style={styles.secureRow}>
              <Ionicons name="shield-checkmark" size={14} color={BRAND_GREEN} />
              <Text style={styles.secureLabel}>
                {t("orders.activeFood.secureVerification", "Secure Verification")}
              </Text>
            </View>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.edgeBannerTop}>
            <View style={styles.infoBannerIcon}>
              <Ionicons name="shield-checkmark" size={22} color="#fff" />
            </View>
            <View style={styles.infoBannerText}>
              <Text style={styles.infoBannerTitle}>
                {t("orders.activeFood.verifyNeedTitle", "We need to verify this pickup")}
              </Text>
              <Text style={styles.infoBannerDesc}>
                {t(
                  "orders.activeFood.verifyNeedDesc",
                  "Choose one of the options below to confirm the order pickup."
                )}
              </Text>
            </View>
            <View style={styles.infoBannerArt}>
              <Ionicons name="clipboard-outline" size={28} color={BRAND_GREEN} />
              <View style={styles.verifiedBadge}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            </View>
          </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={styles.sectionTitle}>
            {t(
              "orders.activeFood.verifyPickupSubtitle",
              "Choose how you want to verify the order pickup"
            )}
          </Text>

          {barcodeEnabled ? (
            <View style={styles.optionCard}>
              <Pressable style={styles.optionTopRow} onPress={onScanBarcode}>
                <View style={styles.optionIllusCol}>
                  <BarcodeIllustration />
                </View>
                <View style={styles.optionBody}>
                  <View style={styles.recommendedBadge}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={styles.recommendedText}>
                      {t("orders.activeFood.recommended", "Recommended")}
                    </Text>
                  </View>
                  <View style={styles.optionTitleRow}>
                    <Text style={styles.optionTitle}>
                      {t("orders.activeFood.verifyBarcodeTitle", "Scan Barcode")}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={BRAND_GREEN} />
                  </View>
                  <Text style={styles.optionDesc}>
                    {t(
                      "orders.activeFood.verifyBarcodeDesc",
                      "Scan the barcode or QR code available on the restaurant bill, invoice, or merchant screen."
                    )}
                  </Text>
                  <FeatureTags tags={BARCODE_TAGS} />
                </View>
              </Pressable>
              <Pressable style={styles.primaryBtn} onPress={onScanBarcode}>
                <Ionicons name="scan-outline" size={20} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {t("orders.activeFood.scanBarcode", "Scan Barcode")}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {otpEnabled ? (
            <View style={styles.optionCard}>
              <Pressable style={styles.optionTopRow} onPress={onEnterOtp}>
                <View style={styles.optionIllusCol}>
                  <OtpIllustration />
                </View>
                <View style={styles.optionBody}>
                  <View style={styles.optionTitleRow}>
                    <Text style={styles.optionTitle}>
                      {t("orders.activeFood.verifyOtpTitle", "Continue with OTP")}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={BRAND_GREEN} />
                  </View>
                  <Text style={styles.optionDesc}>
                    {t(
                      "orders.activeFood.verifyOtpDesc",
                      "Enter the pickup OTP provided by the merchant."
                    )}
                  </Text>
                  <FeatureTags tags={OTP_TAGS} />
                </View>
              </Pressable>
              <Pressable style={styles.outlineBtn} onPress={onEnterOtp}>
                <Ionicons name="keypad-outline" size={20} color={BRAND_GREEN} />
                <Text style={styles.outlineBtnText}>
                  {t("orders.activeFood.enterOtp", "Enter OTP")}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.edgeBannerBottom, { paddingBottom: Math.max(bottomPad, 14) }]}>
            <View style={styles.footerIcon}>
              <Ionicons name="shield-checkmark" size={18} color="#fff" />
            </View>
            <View style={styles.footerText}>
              <Text style={styles.footerTitle}>
                {t("orders.activeFood.verifySafeTitle", "Your information is safe with us")}
              </Text>
              <Text style={styles.footerDesc}>
                {t(
                  "orders.activeFood.verifySafeDesc",
                  "This verification helps ensure a smooth and secure delivery experience."
                )}
              </Text>
            </View>
            <View style={styles.footerArt}>
              <Ionicons name="bicycle" size={30} color={BRAND_GREEN} />
            </View>
          </View>
      </View>
    </Modal>
  );
}

const ILLUS_SIZE = 72;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: CONTENT_PAD,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  secureLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: BRAND_GREEN,
  },
  headerSpacer: {
    width: 40,
  },
  edgeBannerTop: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: BRAND_GREEN_LIGHT,
    paddingHorizontal: CONTENT_PAD,
    paddingVertical: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND_GREEN_SOFT,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: CONTENT_PAD,
    paddingTop: 14,
    paddingBottom: 14,
    gap: 14,
  },
  edgeBannerBottom: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: BRAND_GREEN_LIGHT,
    paddingHorizontal: CONTENT_PAD,
    paddingTop: 14,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: BRAND_GREEN_SOFT,
  },
  infoBannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  infoBannerText: {
    flex: 1,
  },
  infoBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  infoBannerDesc: {
    fontSize: 12,
    color: "#4B5563",
    lineHeight: 17,
  },
  infoBannerArt: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  verifiedBadge: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: BRAND_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  optionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  optionTopRow: {
    flexDirection: "row",
    padding: 14,
    gap: 12,
  },
  optionIllusCol: {
    width: ILLUS_SIZE,
    alignItems: "center",
  },
  optionBody: {
    flex: 1,
    minWidth: 0,
  },
  recommendedBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: BRAND_GREEN,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  optionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  optionTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  optionDesc: {
    fontSize: 13,
    color: "#6B7280",
    lineHeight: 18,
    marginBottom: 10,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: BRAND_GREEN_LIGHT,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
    color: BRAND_GREEN,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: BRAND_GREEN,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: BRAND_GREEN,
    marginHorizontal: 14,
    marginBottom: 14,
    borderRadius: 12,
    paddingVertical: 13,
  },
  outlineBtnText: {
    color: BRAND_GREEN,
    fontSize: 16,
    fontWeight: "700",
  },
  illusWrap: {
    width: ILLUS_SIZE,
    height: ILLUS_SIZE,
    borderRadius: ILLUS_SIZE / 2,
    backgroundColor: BRAND_GREEN_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  otpIllusWrap: {
    backgroundColor: OTP_ACCENT_LIGHT,
  },
  scanBracketTL: {
    position: "absolute",
    top: 10,
    left: 10,
    width: 14,
    height: 14,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: BRAND_GREEN,
    borderTopLeftRadius: 3,
  },
  scanBracketTR: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 14,
    height: 14,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: BRAND_GREEN,
    borderTopRightRadius: 3,
  },
  scanBracketBL: {
    position: "absolute",
    bottom: 10,
    left: 10,
    width: 14,
    height: 14,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
    borderColor: BRAND_GREEN,
    borderBottomLeftRadius: 3,
  },
  scanBracketBR: {
    position: "absolute",
    bottom: 10,
    right: 10,
    width: 14,
    height: 14,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
    borderColor: BRAND_GREEN,
    borderBottomRightRadius: 3,
  },
  phoneMock: {
    width: 34,
    height: 42,
    borderRadius: 6,
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  qrGrid: {
    width: 22,
    height: 22,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  qrCell: {
    width: 6,
    height: 6,
    backgroundColor: "#E5E7EB",
    borderRadius: 1,
  },
  qrCellDark: {
    backgroundColor: "#374151",
  },
  otpDots: {
    flexDirection: "row",
    gap: 4,
    marginTop: 6,
  },
  otpDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: OTP_ACCENT,
  },
  footerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  footerText: {
    flex: 1,
  },
  footerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 3,
  },
  footerDesc: {
    fontSize: 11,
    color: "#4B5563",
    lineHeight: 15,
  },
  footerArt: {
    width: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
