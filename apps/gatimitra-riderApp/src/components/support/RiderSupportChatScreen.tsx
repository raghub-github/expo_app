// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RaiseTicketSubmitForm,
  RaiseTicketSubmitFooter,
  type RaiseTicketSubmitFormHandle,
  type RaiseTicketSubmitPayload,
  type PhotoPreviewState,
} from "@/src/components/support/RaiseTicketSubmitForm";
import { SupportPhotoPreviewModal } from "@/src/components/support/SupportPhotoPreviewModal";
import {
  riderSupportService,
  type RiderTicketListItem,
} from "@/src/services/riderSupport.service";
import { extractApiErrorMessage } from "@/src/services/http";
import { useSessionStore } from "@/src/stores/sessionStore";
import { colors } from "@/src/theme";

const BRAND = colors.primary[600];
const H_PAD = 16;
/** Space for pinned submit bar + safe area so form fields stay scrollable above it. */
const FOOTER_SCROLL_PAD = 96;

function paramString(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function paramInt(raw: string | string[] | undefined): number | null {
  const s = paramString(raw);
  if (!s || !/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isPreLoginParam(raw: string | string[] | undefined): boolean {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "1" || v === "true";
}

/**
 * Raise-ticket form: scrollable fields + Submit bar pinned above keyboard / home indicator.
 */
export function RiderSupportChatScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);
  const formRef = useRef<RaiseTicketSubmitFormHandle>(null);
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    ticket_title_id?: string;
    issue_title?: string;
    section_code?: string;
    title_code?: string;
    order_id?: string;
    formatted_order_id?: string;
    prelogin?: string;
  }>();

  const ticketTitleId = paramInt(params.ticket_title_id);
  const issueTitle = paramString(params.issue_title) ?? t("profile.raiseTicket", "Raise Ticket");
  const sectionCode = paramString(params.section_code);
  const titleCode = paramString(params.title_code);
  const orderId = paramInt(params.order_id);
  const orderLabel = paramString(params.formatted_order_id);
  const isPreLogin = isPreLoginParam(params.prelogin) || !hasSession;

  const [canSubmit, setCanSubmit] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<PhotoPreviewState>({ uri: null, slot: null });
  const [ticket, setTicket] = useState<RiderTicketListItem | null>(null);
  const [sentDescription, setSentDescription] = useState("");
  const [sentPhotoUris, setSentPhotoUris] = useState<string[]>([]);
  const [showCreatedToast, setShowCreatedToast] = useState(false);
  const [showRequestCard, setShowRequestCard] = useState(false);

  useEffect(() => {
    if (!showCreatedToast) return;
    const timer = setTimeout(() => setShowCreatedToast(false), 5000);
    return () => clearTimeout(timer);
  }, [showCreatedToast]);

  const linkedOrderText = orderLabel
    ? orderLabel.startsWith("#")
      ? orderLabel
      : `#${orderLabel}`
    : orderId != null
      ? `#${orderId}`
      : null;

  const createMutation = useMutation({
    mutationFn: async (payload: RaiseTicketSubmitPayload) => {
      if (!ticketTitleId && !titleCode) {
        throw new Error("Issue type missing. Go back and try again.");
      }
      return riderSupportService.createTicketWithPhotos({
        ...(ticketTitleId != null ? { ticket_title_id: ticketTitleId } : {}),
        section_code: sectionCode ?? undefined,
        title_code: titleCode ?? undefined,
        subject: issueTitle,
        description: payload.description,
        order_id: orderId,
        photo_uris: payload.photoUris.length ? payload.photoUris : undefined,
        ...(isPreLogin
          ? {
              pre_login: true,
              raised_by_name: payload.raisedByName,
              raised_by_mobile: payload.raisedByMobile,
              raised_by_email: payload.raisedByEmail,
            }
          : {}),
      });
    },
    onSuccess: (res, payload) => {
      setTicket(res.ticket);
      setSentDescription(payload.description);
      setSentPhotoUris(payload.photoUris);
      setShowCreatedToast(true);
      setShowRequestCard(true);
      queryClient.invalidateQueries({ queryKey: ["rider-support-tickets"] });
    },
    onError: (err) => {
      Alert.alert(
        t("profile.supportFlow.failed", "Could not raise ticket"),
        extractApiErrorMessage(err, "Try again"),
      );
    },
  });

  const onFormSubmit = (payload: RaiseTicketSubmitPayload) => {
    if (createMutation.isPending) return;
    if (isPreLogin) {
      if (!payload.raisedByName?.trim()) {
        Alert.alert(
          t("profile.supportFlow.nameRequired", "Name required"),
          t("profile.supportFlow.nameRequiredMsg", "Please enter your name."),
        );
        return;
      }
      if (!payload.raisedByMobile && !payload.raisedByEmail) {
        Alert.alert(
          t("profile.supportFlow.contactRequired", "Contact required"),
          t(
            "profile.supportFlow.contactRequiredMsg",
            "Please enter a valid mobile number or email address.",
          ),
        );
        return;
      }
    } else if (!hasSession) {
      Alert.alert(
        t("profile.supportFlow.loginRequiredTitle", "Login required"),
        t(
          "profile.supportFlow.loginRequiredMessage",
          "Please log in with your rider account to submit this ticket.",
        ),
        [
          { text: t("common.cancel", "Cancel"), style: "cancel" },
          {
            text: t("auth.login", "Log in"),
            onPress: () => router.push("/(auth)/login"),
          },
        ],
      );
      return;
    }
    createMutation.mutate(payload);
  };

  const onFooterSubmit = () => {
    formRef.current?.submitIfReady();
  };

  const sending = createMutation.isPending;
  const footerBottomPad = Math.max(insets.bottom, 12);

  const openTicketChat = () => {
    if (!ticket) return;
    router.replace({
      pathname: "/ticket-chat/[id]",
      params: { id: String(ticket.id) },
    });
  };

  const goBackToSupport = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/raise-ticket");
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          accessibilityLabel={t("common.back", "Back")}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={2}>
          {issueTitle}
        </Text>
      </View>

      {showCreatedToast ? (
        <View style={styles.toast}>
          <Ionicons name="checkmark-circle" size={18} color="#15803D" />
          <Text style={styles.toastText}>
            {t(
              "profile.supportChat.createdToast",
              "Ticket created successfully. Our support team will review your request shortly.",
            )}
          </Text>
        </View>
      ) : null}

      {showRequestCard && ticket ? (
        <View style={styles.successBody}>
          <ScrollView
            style={styles.successScrollView}
            contentContainerStyle={[
              styles.successScroll,
              { paddingBottom: 24 + footerBottomPad },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.requestCard}>
              <View style={styles.requestHeader}>
                <Ionicons name="information-circle-outline" size={18} color={BRAND} />
                <Text style={styles.requestTitle}>
                  {t("profile.supportChat.requestReceived", "Request received")}
                </Text>
              </View>
              <Text style={styles.requestBody}>
                {t(
                  "profile.supportChat.requestBody",
                  "Your request has been submitted successfully. The GatiMitra Support Team will review your concern and respond shortly.",
                )}
              </Text>
              {linkedOrderText ? (
                <View style={styles.orderRow}>
                  <Ionicons name="receipt-outline" size={14} color="#64748B" />
                  <Text style={styles.orderRowText}>{linkedOrderText}</Text>
                </View>
              ) : null}
              {sentDescription ? (
                <Text style={styles.sentDescription}>{sentDescription}</Text>
              ) : null}
              {sentPhotoUris.length > 0 ? (
                <View style={styles.sentPhotosBlock}>
                  <Text style={styles.sentPhotosLabel}>
                    {t("profile.supportChat.attachedPhotos", "Attached photos")}
                  </Text>
                  <View style={styles.sentPhotosRow}>
                    {sentPhotoUris.map((uri, index) => (
                      <View key={`${uri}-${index}`} style={styles.sentPhotoWrap}>
                        <Image source={{ uri }} style={styles.sentPhotoImg} resizeMode="cover" />
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>

            <View style={styles.successPanel}>
              <Text style={styles.ticketIdLine}>
                {t("profile.supportChat.ticketIdLine", "Tkt Id - {{id}}", {
                  id: ticket.ticket_id || String(ticket.id),
                })}
              </Text>
              <View style={styles.successCreatedRow}>
                <Ionicons name="checkmark-circle" size={22} color="#15803D" />
                <Text style={styles.successCreatedText}>
                  {t("profile.supportChat.successfullyCreated", "Successfully created")}
                </Text>
              </View>

            </View>
          </ScrollView>

          <View style={[styles.successActionBar, { paddingBottom: footerBottomPad }]}>
            {!isPreLogin ? (
              <TouchableOpacity
                activeOpacity={0.88}
                style={styles.trackTicketBtn}
                onPress={openTicketChat}
                accessibilityRole="button"
                accessibilityLabel={t("profile.supportChat.trackTicket", "Track ticket")}
              >
                <Ionicons name="chatbubbles" size={20} color="#0F766E" />
                <Text style={styles.trackTicketBtnText}>
                  {t("profile.supportChat.trackTicket", "Track ticket")}
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.88}
              style={styles.backToSupportBtn}
              onPress={goBackToSupport}
              accessibilityRole="button"
              accessibilityLabel={t("profile.supportChat.backToSupport", "Back to Support")}
            >
              <Ionicons name="arrow-back" size={20} color="#475569" />
              <Text style={styles.backToSupportBtnText}>
                {t("profile.supportChat.backToSupport", "Back to Support")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.body}>
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={[
                styles.formScroll,
                { paddingBottom: (isPreLogin ? 140 : FOOTER_SCROLL_PAD) + footerBottomPad },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator
            >
              {linkedOrderText ? (
                <View style={styles.orderChip}>
                  <Ionicons name="receipt-outline" size={14} color={BRAND} />
                  <Text style={styles.orderChipText}>{linkedOrderText}</Text>
                </View>
              ) : null}
              <RaiseTicketSubmitForm
                ref={formRef}
                issueTitle={issueTitle}
                isPreLogin={isPreLogin}
                onCanSubmitChange={setCanSubmit}
                onSubmit={onFormSubmit}
                onPhotoPreviewChange={setPhotoPreview}
                onDescriptionFocus={() => {
                  requestAnimationFrame(() => {
                    scrollRef.current?.scrollTo({ y: 0, animated: true });
                  });
                }}
              />
            </ScrollView>

            <View style={[styles.footerBar, { paddingBottom: footerBottomPad }]}>
              <RaiseTicketSubmitFooter
                canSubmit={canSubmit}
                submitting={sending}
                onPress={onFooterSubmit}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}

      <SupportPhotoPreviewModal
        visible={photoPreview.uri != null}
        uri={photoPreview.uri}
        onCancel={() => formRef.current?.cancelPhotoPreview()}
        onConfirm={() => formRef.current?.confirmPhotoPreview()}
        onPickAnother={() => formRef.current?.pickAnotherPhoto()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PAD,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  backBtnPressed: { opacity: 0.8 },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  toast: {
    marginHorizontal: H_PAD,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toastText: { flex: 1, fontSize: 12, color: "#0F172A", lineHeight: 16 },
  body: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  formScroll: {
    paddingBottom: 8,
  },
  orderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: H_PAD,
    marginTop: 12,
    backgroundColor: colors.primary[100],
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  orderChipText: { fontSize: 12, fontWeight: "700", color: BRAND },
  footerBar: {
    flexShrink: 0,
    width: "100%",
    paddingHorizontal: H_PAD,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "stretch",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  successBody: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  successScrollView: {
    flex: 1,
    minHeight: 0,
  },
  successScroll: {
    padding: H_PAD,
    paddingTop: 8,
    paddingBottom: 8,
  },
  successActionBar: {
    flexShrink: 0,
    width: "100%",
    alignItems: "stretch",
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  requestCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  requestHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  requestTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  requestBody: { fontSize: 13, color: "#64748B", lineHeight: 20 },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  orderRowText: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  sentDescription: {
    marginTop: 12,
    fontSize: 13,
    color: "#334155",
    lineHeight: 20,
    backgroundColor: "#FFFFFF",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  sentPhotosBlock: {
    marginTop: 14,
  },
  sentPhotosLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 10,
  },
  sentPhotosRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  sentPhotoWrap: {
    width: 88,
    height: 88,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F1F5F9",
  },
  sentPhotoImg: {
    width: "100%",
    height: "100%",
  },
  successPanel: {
    marginTop: 28,
    alignItems: "stretch",
    width: "100%",
  },
  ticketIdLine: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  successCreatedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },
  successCreatedText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#15803D",
  },
  trackTicketBtn: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#CCFBF1",
    borderWidth: 2,
    borderColor: "#0D9488",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    minHeight: 52,
  },
  trackTicketBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F766E",
  },
  backToSupportBtn: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    minHeight: 52,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  backToSupportBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#475569",
  },
});
