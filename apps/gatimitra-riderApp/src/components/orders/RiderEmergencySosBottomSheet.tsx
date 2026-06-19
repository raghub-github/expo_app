import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Alert,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DismissibleBottomSheetShell,
  useBottomSheetViewport,
} from "@/src/components/language/DismissibleBottomSheetShell";
import { riderApi, type RiderEmergencyContact } from "@/src/services/api/riderApi";

const MAX_CONTACTS = 2;
const SHEET_MAX_RATIO = 0.88;

const C = {
  white: "#FFFFFF",
  text: "#111827",
  textMuted: "#6B7280",
  textSection: "#9CA3AF",
  blue: "#1976D2",
  blueLight: "#E3F2FD",
  blueBanner: "#EFF6FF",
  blueBannerBorder: "#BBDEFB",
  green: "#2E7D32",
  greenLight: "#E8F5E9",
  red: "#E53935",
  redLight: "#FFEBEE",
  orange: "#F57C00",
  orangeLight: "#FFF3E0",
  yellowBanner: "#FEFCE8",
  yellowBannerBorder: "#FEF08A",
  yellowIcon: "#EAB308",
  border: "#E5E7EB",
  closeBg: "#F3F4F6",
  sirenBg: "#FFEBEE",
  purple: "#7B1FA2",
  purpleLight: "#F3E5F5",
};

const OFFICIAL_SERVICES = [
  {
    key: "police",
    label: "Police",
    number: "112",
    icon: "shield-star" as const,
    iconColor: C.blue,
    iconBg: C.blueLight,
    callVariant: "official" as const,
  },
  {
    key: "ambulance",
    label: "Ambulance",
    number: "108",
    icon: "medical-bag" as const,
    iconColor: C.red,
    iconBg: C.redLight,
    callVariant: "official" as const,
  },
  {
    key: "fire",
    label: "Fire",
    number: "101",
    icon: "fire" as const,
    iconColor: C.orange,
    iconBg: C.orangeLight,
    callVariant: "official" as const,
  },
];

const PERSONAL_ICON_PALETTE = [
  { iconColor: C.green, iconBg: C.greenLight },
  { iconColor: C.purple, iconBg: C.purpleLight },
];

type Props = {
  visible: boolean;
  onDismiss: () => void;
  embedded?: boolean;
};

function dialNumber(raw: string, t: (key: string, fallback: string) => string) {
  const tel = raw.replace(/\D/g, "");
  void Linking.openURL(`tel:${tel}`).catch(() => {
    Alert.alert(
      t("orders.sos.callFailedTitle", "Could not call"),
      t("orders.sos.callFailedMessage", "Unable to open the phone dialer.")
    );
  });
}

export function RiderEmergencySosBottomSheet({
  visible,
  onDismiss,
  embedded = false,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { scrollMaxH, bottomPad } = useBottomSheetViewport(SHEET_MAX_RATIO, {
    compactBottomInset: true,
    includeHandle: false,
    sheetBottomPadding: 0,
  });
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftPhone, setDraftPhone] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["rider", "emergency-contacts"],
    queryFn: () => riderApi.getEmergencyContacts(),
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
  });

  const saveMutation = useMutation({
    mutationFn: (contacts: RiderEmergencyContact[]) => riderApi.saveEmergencyContacts(contacts),
    onSuccess: (saved) => {
      queryClient.setQueryData(["rider", "emergency-contacts"], saved);
      setAdding(false);
      setDraftLabel("");
      setDraftPhone("");
    },
    onError: () => {
      Alert.alert(
        t("orders.sos.saveFailedTitle", "Could not save"),
        t("orders.sos.saveFailedMessage", "Please check the contact details and try again.")
      );
    },
  });

  useEffect(() => {
    if (!visible) {
      setAdding(false);
      setDraftLabel("");
      setDraftPhone("");
    }
  }, [visible]);

  const contacts = data?.contacts ?? [];
  const personalContactsLoading = (isLoading || isFetching) && contacts.length === 0;
  const canAddMore = contacts.length < MAX_CONTACTS;

  const handleSaveNew = useCallback(() => {
    const label = draftLabel.trim();
    const phone = draftPhone.replace(/\D/g, "");
    if (!label || phone.length !== 10) {
      Alert.alert(
        t("orders.sos.invalidContactTitle", "Invalid contact"),
        t(
          "orders.sos.invalidContactMessage",
          "Enter a name and a valid 10-digit mobile number."
        )
      );
      return;
    }
    saveMutation.mutate([...contacts, { label, phone }]);
  }, [contacts, draftLabel, draftPhone, saveMutation, t]);

  const confirmRemove = useCallback(
    (index: number, label: string) => {
      Alert.alert(
        t("orders.sos.removeContactTitle", "Remove contact"),
        t("orders.sos.removeContactMessage", "Remove {{name}} from emergency contacts?", {
          name: label,
        }),
        [
          { text: t("common.cancel", "Cancel"), style: "cancel" },
          {
            text: t("common.remove", "Remove"),
            style: "destructive",
            onPress: () => saveMutation.mutate(contacts.filter((_, i) => i !== index)),
          },
        ]
      );
    },
    [contacts, saveMutation, t]
  );

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={SHEET_MAX_RATIO}
      keyboardAware
      embedded={embedded}
      compactBottomInset
      showOuterHandle={false}
      sheetBottomPadding={0}
      sheetStyle={styles.sheetSurface}
    >
      <ScrollView
        style={[styles.scroll, { maxHeight: scrollMaxH }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(bottomPad, 16) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.dragHandle} />

        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.sirenIconWrap}>
              <MaterialCommunityIcons name="alarm-light" size={22} color={C.red} />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.headerTitle}>
                {t("orders.sos.sheetTitle", "Emergency SOS")}
              </Text>
              <Text style={styles.headerSubtitle}>
                {t("orders.sos.sheetSubtitle", "Tap any number to call")}
              </Text>
            </View>
          </View>
          <Pressable onPress={onDismiss} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={20} color="#374151" />
          </Pressable>
        </View>

        <View style={styles.locationBanner}>
          <View style={styles.locationBannerIconWrap}>
            <MaterialCommunityIcons name="shield-check" size={18} color={C.blue} />
          </View>
          <Text style={styles.locationBannerText}>
            {t("orders.sos.locationBannerPrefix", "Your live location is being shared with ")}{" "}
            <Text style={styles.locationBannerBold}>
              {t("orders.sos.locationBannerBold", "GatiMitra support team.")}
            </Text>
          </Text>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>
            {t("orders.sos.officialServices", "OFFICIAL EMERGENCY SERVICES")}
          </Text>
          <View style={styles.sectionCard}>
            {OFFICIAL_SERVICES.map((service, index) => (
              <SosContactRow
                key={service.key}
                label={t(`orders.sos.${service.key}`, service.label)}
                number={service.number}
                icon={
                  <MaterialCommunityIcons
                    name={service.icon}
                    size={20}
                    color={service.iconColor}
                  />
                }
                iconBg={service.iconBg}
                callVariant={service.callVariant}
                showDivider={index > 0}
                onCall={() => dialNumber(service.number, t)}
              />
            ))}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <Text style={styles.sectionLabel}>
            {t("orders.sos.personalContacts", "YOUR EMERGENCY CONTACTS")}
          </Text>
          <Text style={styles.sectionSubtext}>
            {t(
              "orders.sos.personalHint",
              "Your saved contacts for quick help during deliveries."
            )}
          </Text>
          <View style={styles.sectionCard}>
            {personalContactsLoading ? (
              <ActivityIndicator
                size="small"
                color={C.green}
                style={styles.personalLoader}
              />
            ) : null}

            {contacts.length === 0 && !personalContactsLoading && !adding ? (
              <View style={styles.emptyRow}>
                <Text style={styles.emptyText}>
                  {t("orders.sos.noPersonalContacts", "No personal contacts saved yet.")}
                </Text>
              </View>
            ) : null}

            {contacts.map((contact, index) => {
              const palette = PERSONAL_ICON_PALETTE[index % PERSONAL_ICON_PALETTE.length];
              return (
                <SosContactRow
                  key={`${contact.phone}-${index}`}
                  label={contact.label}
                  number={contact.phone}
                  icon={<Ionicons name="person" size={18} color={palette.iconColor} />}
                  iconBg={palette.iconBg}
                  callVariant="personal"
                  showDivider={index > 0}
                  onCall={() => dialNumber(contact.phone, t)}
                  onLongPress={() => confirmRemove(index, contact.label)}
                />
              );
            })}

            {canAddMore && !adding && !personalContactsLoading ? (
              <Pressable
                style={[
                  styles.addContactRow,
                  contacts.length > 0 && styles.addContactRowBorder,
                ]}
                onPress={() => setAdding(true)}
                disabled={saveMutation.isPending}
              >
                <Ionicons name="person-add-outline" size={18} color={C.green} />
                <Text style={styles.addContactText}>
                  {t("orders.sos.addContact", "Add emergency contact")}
                </Text>
              </Pressable>
            ) : null}

            {adding ? (
              <View style={[styles.formCard, contacts.length > 0 && styles.formCardBorder]}>
                <Text style={styles.formTitle}>
                  {t("orders.sos.addContactFormTitle", "New emergency contact")}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder={t("orders.sos.contactNamePlaceholder", "Contact name")}
                  placeholderTextColor="#9CA3AF"
                  value={draftLabel}
                  onChangeText={setDraftLabel}
                  maxLength={40}
                />
                <TextInput
                  style={styles.input}
                  placeholder={t("orders.sos.contactPhonePlaceholder", "10-digit mobile")}
                  placeholderTextColor="#9CA3AF"
                  value={draftPhone}
                  onChangeText={(v) => setDraftPhone(v.replace(/\D/g, "").slice(0, 10))}
                  keyboardType="phone-pad"
                  maxLength={10}
                />
                <View style={styles.formActions}>
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => {
                      setAdding(false);
                      setDraftLabel("");
                      setDraftPhone("");
                    }}
                  >
                    <Text style={styles.cancelBtnText}>{t("common.cancel", "Cancel")}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveBtn, saveMutation.isPending && styles.saveBtnDisabled]}
                    onPress={handleSaveNew}
                    disabled={saveMutation.isPending}
                  >
                    <Text style={styles.saveBtnText}>{t("common.save", "Save")}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.footerBanner}>
          <View style={styles.footerBannerIconWrap}>
            <MaterialCommunityIcons name="shield-account" size={18} color={C.yellowIcon} />
          </View>
          <Text style={styles.footerBannerText}>
            {t(
              "orders.sos.footerNote",
              "Your location will be shared with the emergency team and your safety is our priority."
            )}
          </Text>
        </View>
      </ScrollView>
    </DismissibleBottomSheetShell>
  );
}

function SosContactRow({
  label,
  number,
  icon,
  iconBg,
  callVariant,
  showDivider = false,
  onCall,
  onLongPress,
}: {
  label: string;
  number: string;
  icon: React.ReactNode;
  iconBg: string;
  callVariant: "official" | "personal";
  showDivider?: boolean;
  onCall: () => void;
  onLongPress?: () => void;
}) {
  const callBg = callVariant === "official" ? C.blueLight : C.greenLight;
  const callIconColor = callVariant === "official" ? C.blue : C.green;

  return (
    <Pressable
      onPress={onCall}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.contactRowOuter,
        showDivider && styles.contactRowDivider,
        pressed && styles.contactRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Call ${label}`}
    >
      <View style={styles.contactRowInner}>
        <View style={[styles.contactIconWrap, { backgroundColor: iconBg }]}>{icon}</View>

        <View style={styles.contactTextCol}>
          <Text style={styles.contactLabel} numberOfLines={1} ellipsizeMode="tail">
            {label}
          </Text>
          <Text style={styles.contactNumber} numberOfLines={1} ellipsizeMode="tail">
            {number}
          </Text>
        </View>

        <View style={[styles.callBtn, { backgroundColor: callBg }]}>
          <Ionicons name="call" size={16} color={callIconColor} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetSurface: {
    backgroundColor: C.white,
  },
  scroll: {
    width: "100%",
  },
  scrollContent: {
    flexGrow: 0,
  },
  dragHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D1D5DB",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 12,
  },
  sirenIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.sirenBg,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "400",
    color: C.textMuted,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.closeBg,
    alignItems: "center",
    justifyContent: "center",
  },
  locationBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.blueBanner,
    borderWidth: 1,
    borderColor: C.blueBannerBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  locationBannerIconWrap: {
    width: 20,
    flexShrink: 0,
    marginRight: 10,
    marginTop: 1,
  },
  locationBannerText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "400",
    color: C.blue,
    lineHeight: 19,
  },
  locationBannerBold: {
    fontWeight: "700",
    color: C.blue,
  },
  sectionBlock: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textSection,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  sectionSubtext: {
    fontSize: 12,
    fontWeight: "400",
    color: C.textMuted,
    marginTop: -4,
    marginBottom: 8,
  },
  sectionCard: {
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
  },
  contactRowOuter: {
    width: "100%",
    backgroundColor: C.white,
  },
  contactRowInner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  contactRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  contactRowPressed: {
    backgroundColor: "#F9FAFB",
  },
  contactIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  contactTextCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    marginRight: 12,
  },
  contactLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: C.text,
    lineHeight: 20,
  },
  contactNumber: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "500",
    color: C.blue,
    fontVariant: ["tabular-nums"],
    lineHeight: 18,
  },
  callBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  personalLoader: {
    paddingVertical: 16,
    alignSelf: "center",
  },
  emptyRow: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "400",
    color: C.textMuted,
    fontStyle: "italic",
  },
  addContactRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  addContactRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  addContactText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "600",
    color: C.green,
  },
  formCard: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: "#FAFAFA",
  },
  formCardBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  formTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: C.text,
    marginBottom: 10,
  },
  input: {
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.white,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "400",
    color: C.text,
    marginBottom: 8,
  },
  formActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  cancelBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "500",
    color: C.textMuted,
  },
  saveBtn: {
    minHeight: 40,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.white,
  },
  footerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: C.yellowBanner,
    borderWidth: 1,
    borderColor: C.yellowBannerBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginTop: 4,
  },
  footerBannerIconWrap: {
    width: 20,
    flexShrink: 0,
    marginRight: 10,
    marginTop: 1,
  },
  footerBannerText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "400",
    color: C.text,
    lineHeight: 19,
  },
});
