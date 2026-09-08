import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useAuthStore } from "@/store/authStore";
import { customerSupportService } from "@/services/customerSupport.service";
import {
  pickReportFraudMenuTopics,
  REPORT_FRAUD_MENU_TITLE_CODES,
  REPORT_FRAUD_MENU_TOPIC_LABELS,
  type ReportFraudMenuTopic,
} from "@/lib/reportFraudMenuTopics";

const ACCENT = GatiMitraColors.deepMintStart;
const ACCENT_DISABLED = "#A7F3D0";
const PHOTO_BORDER = "#86EFAC";
const TEXT = "#1C1C1C";
const MUTED = "#828282";
const BORDER = "#EBEBEB";
const MIN_DETAILS = 10;

/** Prefer public `store_id`; only send PK when the route id is numeric. */
function storeCreatePayload(storeId: string, storeNumericId?: number | null) {
  const sid = storeId.trim();
  if (sid && !/^\d+$/.test(sid)) {
    return { store_id: sid, merchant_store_id: null as number | null };
  }
  const pk =
    storeNumericId != null && storeNumericId > 0
      ? storeNumericId
      : /^\d+$/.test(sid)
        ? Number(sid)
        : null;
  return { store_id: null as string | null, merchant_store_id: pk };
}

async function resolveFraudTicketTitleId(
  topic: ReportFraudMenuTopic,
  catalog: ReportFraudMenuTopic[]
): Promise<number | undefined> {
  if (topic.ticket_title_id > 0) return topic.ticket_title_id;
  const hydrated = catalog.find(
    (t) =>
      t.ticket_title_id > 0 &&
      (t.title_text === topic.title_text ||
        (topic.title_code != null && t.title_code === topic.title_code))
  );
  if (hydrated) return hydrated.ticket_title_id;
  const code = (topic.title_code ?? "").trim();
  if (!code) return undefined;
  try {
    const sections = await customerSupportService.getHelpSections({
      titleCode: code,
      serviceType: "food",
    });
    const hit = sections.find(
      (s) => (s.title_code ?? "").trim().toUpperCase() === code.toUpperCase()
    );
    if (hit?.ticket_title_id != null && hit.ticket_title_id > 0) {
      return hit.ticket_title_id;
    }
  } catch {
    // Label fallback on the API still classifies the ticket.
  }
  return undefined;
}

const FALLBACK_TOPICS: ReportFraudMenuTopic[] = REPORT_FRAUD_MENU_TOPIC_LABELS.map(
  (title_text, index) => ({
    ticket_title_id: -(index + 1),
    title_code: REPORT_FRAUD_MENU_TITLE_CODES[index] ?? null,
    title_text,
    section_id: "orders",
  })
);

type Props = {
  visible: boolean;
  storeId: string;
  storeNumericId?: number | null;
  storeName?: string;
  onClose: () => void;
};

export function ReportFraudMenuIssueSheet({
  visible,
  storeId,
  storeNumericId,
  storeName,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const [selected, setSelected] = useState<ReportFraudMenuTopic | null>(null);
  const [details, setDetails] = useState("");
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const topicsQ = useQuery({
    queryKey: ["report-fraud-menu-topics"],
    queryFn: async () => {
      const sections = await customerSupportService.getHelpSections({
        groupCode: "CUST_ORDERS",
        serviceType: "food",
        intakeOnly: true,
      });
      const picked = pickReportFraudMenuTopics(sections);
      if (picked.length === REPORT_FRAUD_MENU_TOPIC_LABELS.length) return picked;
      return FALLBACK_TOPICS.map(
        (row) =>
          picked.find(
            (p) =>
              p.title_text === row.title_text ||
              (row.title_code != null && p.title_code === row.title_code)
          ) ?? row
      );
    },
    // Immediate paint via placeholder — do NOT use initialData (blocks refetch / real IDs).
    placeholderData: FALLBACK_TOPICS,
    enabled: visible,
    staleTime: 60_000,
  });

  const topics =
    topicsQ.data && topicsQ.data.length > 0 ? topicsQ.data : FALLBACK_TOPICS;

  useEffect(() => {
    if (!visible) {
      setSelected(null);
      setDetails("");
      setPhotoUri(null);
    }
  }, [visible]);

  // Allow submit as soon as details are enough; catalog IDs hydrate in the background.
  const canSubmit = !!selected && details.trim().length >= MIN_DETAILS;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Pick an issue first.");
      const description = details.trim();
      if (description.length < MIN_DETAILS) {
        throw new Error("Please share a few more details.");
      }
      const titleId = await resolveFraudTicketTitleId(selected, topics);
      const storeLabel = storeName?.trim() || "Restaurant";
      const storeIds = storeCreatePayload(storeId, storeNumericId);
      if (!storeIds.store_id && storeIds.merchant_store_id == null) {
        throw new Error("Store not found. Close and open this restaurant again.");
      }
      return customerSupportService.createTicketWithPhotos({
        ticket_title_id: titleId,
        section_code: selected.section_id ?? "orders",
        subject: `${storeLabel} — ${selected.title_text}`,
        description,
        selected_issue_label: selected.title_text,
        photo_uris: photoUri ? [photoUri] : [],
        store_id: storeIds.store_id,
        merchant_store_id: storeIds.merchant_store_id,
        deferAttachments: true,
      });
    },
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ["customer-support-tickets"] });
      const ref = ticket?.ticket_id?.trim()
        ? ticket.ticket_id.startsWith("#")
          ? ticket.ticket_id
          : `#${ticket.ticket_id}`
        : "";
      Alert.alert(
        "Ticket created",
        ref
          ? `Your report was submitted. Ticket ID is ${ref}. Our team will review it shortly.`
          : "Your report was submitted. Our team will review it shortly."
      );
      onClose();
    },
    onError: (err) => {
      const apiErr = err as Error & { response?: { data?: { message?: string; error?: string } } };
      const code = apiErr.response?.data?.error;
      const message =
        apiErr.response?.data?.message ??
        (code === "store_not_found"
          ? "Could not link this restaurant. Close and try again."
          : code === "invalid_ticket_title" || code === "invalid_ticket_title_id"
            ? "Could not classify this issue. Please pick the topic again."
            : code === "customer_required"
              ? "Please sign in to report this restaurant."
              : apiErr instanceof Error
                ? apiErr.message
                : "Please try again.");
      Alert.alert("Could not create ticket", message);
    },
  });

  const pickPhoto = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to attach an image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    setPhotoUri(result.assets[0].uri);
  }, []);

  const onSelectTopic = useCallback(
    (topic: ReportFraudMenuTopic) => {
      if (!session) {
        Alert.alert("Sign in required", "Please sign in to report this restaurant.");
        return;
      }
      setSelected(topic);
      setDetails("");
      setPhotoUri(null);
    },
    [session]
  );

  const headerTitle = selected?.title_text ?? "Report fraud or bad practices";

  const listBody = useMemo(
    () =>
      topics.map((topic, index) => (
        <TouchableOpacity
          key={topic.title_code ?? `${topic.title_text}-${index}`}
          style={styles.optionRow}
          onPress={() => onSelectTopic(topic)}
          activeOpacity={0.8}
        >
          <AppText style={styles.optionText}>{topic.title_text}</AppText>
          <Ionicons name="chevron-forward" size={20} color={MUTED} />
        </TouchableOpacity>
      )),
    [onSelectTopic, topics]
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (selected) {
          setSelected(null);
          return;
        }
        onClose();
      }}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.dim}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
          <View style={styles.headerRow}>
            {selected ? (
              <TouchableOpacity
                onPress={() => setSelected(null)}
                hitSlop={12}
                style={styles.headerBtn}
                accessibilityLabel="Back"
              >
                <Ionicons name="chevron-back" size={22} color={TEXT} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerBtn} />
            )}
            <AppText style={styles.headerTitle} numberOfLines={2}>
              {headerTitle}
            </AppText>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.headerBtn}>
              <Ionicons name="close" size={20} color={TEXT} />
            </TouchableOpacity>
          </View>

          {selected ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.detailsContent}
            >
              <AppText style={styles.detailsLead}>Share more details about the issue</AppText>
              <AppText style={styles.detailsSub}>We will get them fixed as soon as possible</AppText>
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="Start typing here..."
                placeholderTextColor={MUTED}
                style={styles.detailsInput}
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />
              <AppText style={styles.photosLabel}>Upload an image (optional)</AppText>
              {photoUri ? (
                <Pressable style={styles.photoPreview} onPress={() => void pickPhoto()}>
                  <Image source={{ uri: photoUri }} style={styles.photoImg} />
                  <TouchableOpacity
                    style={styles.photoRemove}
                    onPress={() => setPhotoUri(null)}
                    hitSlop={8}
                  >
                    <Ionicons name="close-circle" size={22} color={TEXT} />
                  </TouchableOpacity>
                </Pressable>
              ) : (
                <TouchableOpacity style={styles.photoBtn} onPress={() => void pickPhoto()}>
                  <Ionicons name="camera-outline" size={20} color={ACCENT} />
                  <AppText style={styles.photoBtnText}>Add a photo</AppText>
                </TouchableOpacity>
              )}
              <Pressable
                style={[styles.submitBtn, (!canSubmit || submitMutation.isPending) && styles.submitBtnDisabled]}
                disabled={!canSubmit || submitMutation.isPending}
                onPress={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <AppText style={styles.submitBtnText}>Submit</AppText>
                )}
              </Pressable>
            </ScrollView>
          ) : (
            <>
              <AppText style={styles.sub}>
                Menu items, photos and descriptions are set by the restaurant. Report incorrect
                information so we can review it.
              </AppText>
              {listBody}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  dim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: "82%",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  headerBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
  },
  sub: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 18,
    marginBottom: 8,
  },
  loadingWrap: {
    minHeight: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    paddingVertical: 24,
    textAlign: "center",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
    gap: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
  },
  detailsContent: {
    paddingBottom: 8,
  },
  detailsLead: {
    fontSize: 16,
    fontWeight: "800",
    color: TEXT,
    marginTop: 6,
  },
  detailsSub: {
    fontSize: 13,
    color: MUTED,
    marginTop: 4,
    marginBottom: 12,
  },
  detailsInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: TEXT,
    backgroundColor: "#FAFAFA",
  },
  photosLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
  },
  photoBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: PHOTO_BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    backgroundColor: "#F0FDF4",
  },
  photoBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: ACCENT,
  },
  photoPreview: {
    width: 112,
    height: 112,
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImg: {
    width: "100%",
    height: "100%",
  },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  submitBtn: {
    marginTop: 18,
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  submitBtnDisabled: {
    backgroundColor: ACCENT_DISABLED,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
