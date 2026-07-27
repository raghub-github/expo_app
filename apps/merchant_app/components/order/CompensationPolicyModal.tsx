import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { Modal, View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildCompensationPolicySections,
  type MerchantCompensationPolicyDisplay,
} from "@/lib/merchantCancellationCompensation";
import {
  fetchCompensationPolicy,
  getCachedCompensationPolicy,
} from "@/lib/compensationPolicyCache";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  storeId: number;
  token: string;
  title?: string;
};

export function CompensationPolicyModal({
  visible,
  onClose,
  storeId,
  token,
  title = "Compensation Policy",
}: Props) {
  const insets = useSafeAreaInsets();
  const cached = getCachedCompensationPolicy(storeId, token);
  const [loading, setLoading] = useState(cached === undefined);
  const [policy, setPolicy] = useState<MerchantCompensationPolicyDisplay | null>(
    cached === undefined ? null : cached,
  );

  const load = useCallback(async () => {
    const hasCache = getCachedCompensationPolicy(storeId, token) !== undefined;
    if (!hasCache) setLoading(true);
    const next = await fetchCompensationPolicy(storeId, token, { force: hasCache });
    setPolicy(next);
    setLoading(false);
  }, [storeId, token]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const modalTitle = policy?.policy_modal_title || title;
  const sections = useMemo(
    () => (policy ? buildCompensationPolicySections(policy) : []),
    [policy],
  );

  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} accessibilityLabel="Close" />

        <View style={[styles.sheet, { paddingBottom: bottomInset }]}>
          <View style={styles.sheetHandle} />

          <View style={styles.headerRow}>
            <View style={styles.headerSide} />
            <Text style={styles.title} numberOfLines={2}>
              {modalTitle}
            </Text>
            <Pressable
              style={styles.headerSide}
              onPress={onClose}
              accessibilityLabel="Close compensation policy"
              hitSlop={12}
            >
              <Ionicons name="close" size={22} color={GatiMitraMerchant.textSecondary} />
            </Pressable>
          </View>

          {loading && !policy ? (
            <ActivityIndicator color={GatiMitraMerchant.primary} style={styles.loader} />
          ) : !policy || sections.length === 0 ? (
            <Text style={styles.empty}>Compensation policy is not available right now.</Text>
          ) : (
            <View style={styles.policyCard}>
              {sections.map((section, sectionIdx) => (
                <View
                  key={`${section.heading}-${sectionIdx}`}
                  style={sectionIdx > 0 ? styles.sectionGap : undefined}
                >
                  <Text
                    style={[
                      styles.sectionHeading,
                      section.variant === "exclusion" && styles.sectionHeadingMuted,
                    ]}
                  >
                    {section.heading}
                  </Text>
                  {section.bullets.map((bullet, bulletIdx) => (
                    <View key={`${sectionIdx}-${bulletIdx}`} style={styles.bulletRow}>
                      <View
                        style={[
                          styles.bulletDot,
                          section.variant === "exclusion" && styles.bulletDotMuted,
                        ]}
                      />
                      <Text style={styles.bulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.okBtn} onPress={onClose}>
            <Text style={styles.okBtnText}>Okay</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    justifyContent: "flex-end",
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: "94%",
    borderTopWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
  },
  headerSide: {
    width: 36,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraMerchant.navy,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  loader: { marginVertical: 28 },
  empty: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginVertical: 24,
    lineHeight: 20,
  },
  policyCard: {
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  sectionGap: {
    marginTop: 12,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.navy,
    lineHeight: 20,
    marginBottom: 6,
  },
  sectionHeadingMuted: {
    color: "#B45309",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
    paddingLeft: 2,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: GatiMitraMerchant.primary,
    marginTop: 7,
    flexShrink: 0,
  },
  bulletDotMuted: {
    backgroundColor: "#F59E0B",
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 20,
  },
  okBtn: {
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  okBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
