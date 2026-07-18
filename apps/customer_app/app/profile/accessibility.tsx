/**
 * Accessibility settings — Zomato-style card layout with GatiMitra mint branding.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { ProfileTheme } from "@/constants/profileTheme";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useProfile } from "@/hooks/useProfile";
import { PROFILE_QUERY_KEY } from "@/lib/profileCache";
import { profileService } from "@/services/profile.service";
import {
  ACCESSIBILITY_SECTIONS,
  accessibilityEquals,
  accessibilityFromProfile,
  type AccessibilityPreferences,
  type AccessibilitySection,
} from "@/lib/accessibility-settings";

const MINT = GatiMitraColors.primaryMint;
const MINT_DARK = GatiMitraColors.deepMintStart;
const { text: TEXT, muted: MUTED, border: BORDER, pageBg: PAGE_BG, mintSoft: MINT_SOFT } = ProfileTheme;

function RadioOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.radioRow} accessibilityRole="radio" accessibilityState={{ selected }}>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <AppText style={styles.radioLabel}>{label}</AppText>
    </Pressable>
  );
}

function SectionCard({
  section,
  value,
  onChange,
}: {
  section: AccessibilitySection;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderText}>
          <AppText style={styles.sectionTitle}>{section.title}</AppText>
          <AppText style={styles.sectionSubtitle}>{section.subtitle}</AppText>
        </View>
        <View style={styles.sectionIconWrap}>
          <Ionicons name={section.icon} size={22} color={MINT_DARK} />
        </View>
      </View>
      <View style={styles.sectionDivider} />
      {section.options.map((opt, idx) => (
        <View key={opt.value}>
          {idx > 0 ? <View style={styles.optionDivider} /> : null}
          <RadioOption
            label={opt.label}
            selected={value === opt.value}
            onPress={() => onChange(opt.value)}
          />
        </View>
      ))}
    </View>
  );
}

export default function AccessibilitySettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useProfile();

  const saved = useMemo(() => accessibilityFromProfile(profile), [profile]);
  const [draft, setDraft] = useState<AccessibilityPreferences>(saved);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const isDirty = !accessibilityEquals(draft, saved);
  const canSave = isDirty && !saving;

  const setField = useCallback((field: keyof AccessibilityPreferences, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value as AccessibilityPreferences[typeof field] }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await profileService.updateProfile(draft);
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
      Alert.alert("Saved", "Your accessibility preferences have been updated.");
    } catch {
      Alert.alert("Could not save", "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [canSave, draft, queryClient]);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" backgroundColor="#fff" />
      <ProfileSubpageHeader title="Accessibility Settings" onBack={() => router.back()} />

      {isLoading && !profile ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={MINT} />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 96 }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.heroCard}>
              <View style={styles.heroTextCol}>
                <AppText style={styles.heroTitle}>
                  We'll make the app more friendly to use based on your disability.
                </AppText>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => router.push("/profile/legal/accessibility-statement" as never)}
                >
                  <AppText style={styles.heroLink}>Help us improve your experience ▸</AppText>
                </TouchableOpacity>
              </View>
              <View style={styles.heroPhone}>
                <Ionicons name="phone-portrait-outline" size={28} color={MINT_DARK} />
                <View style={styles.heroPhoneBadge}>
                  <AppText style={styles.heroPhoneBadgeText}>GM</AppText>
                </View>
              </View>
            </View>

            {ACCESSIBILITY_SECTIONS.map((section) => (
              <SectionCard
                key={section.id}
                section={section}
                value={draft[section.field]}
                onChange={(v) => setField(section.field, v)}
              />
            ))}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <TouchableOpacity
              style={[styles.saveBtn, canSave ? styles.saveBtnActive : styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
              activeOpacity={0.88}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <AppText style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>Save</AppText>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: MINT_SOFT,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
    lineHeight: 22,
  },
  heroLink: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: MINT_DARK,
  },
  heroPhone: {
    width: 56,
    height: 72,
    borderRadius: 12,
    backgroundColor: MINT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  heroPhoneBadge: {
    position: "absolute",
    bottom: 10,
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  heroPhoneBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fff",
  },
  sectionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: "hidden",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  sectionHeaderText: { flex: 1, minWidth: 0 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
  },
  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
  },
  sectionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: PAGE_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginHorizontal: 16,
  },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: MINT,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: MINT,
  },
  radioLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: TEXT,
    lineHeight: 21,
  },
  optionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginLeft: 16 + 22 + 12,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: PAGE_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnActive: {
    backgroundColor: MINT,
  },
  saveBtnDisabled: {
    backgroundColor: "#E5E7EB",
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
  },
  saveBtnTextDisabled: {
    color: "#9CA3AF",
  },
});
