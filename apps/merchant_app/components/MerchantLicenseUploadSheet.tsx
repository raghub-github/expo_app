import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  Linking,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, FONT_LORA, FONT_LORA_BOLD, FONT_POPPINS, FONT_POPPINS_BOLD } from "@/constants/theme";
import { TypographyVariantProvider } from "@/lib/typographyVariant";
import {
  fetchLicenseDocumentsStatus,
  uploadLicenseDocument,
  type LicenseDocumentActionItem,
  type MerchantDocumentPrefix,
} from "@/services/licenseDocumentsApi";

type Props = {
  visible: boolean;
  storeId: number;
  token: string;
  initialPrefix?: MerchantDocumentPrefix | null;
  onClose: () => void;
  onUploaded: () => void;
};

let NativeDateTimePicker: React.ComponentType<any> | null = null;
try {
  NativeDateTimePicker = require("@react-native-community/datetimepicker").default;
} catch {
  NativeDateTimePicker = null;
}

type DocumentPickerModule = {
  getDocumentAsync: (opts: {
    type?: string | string[];
    copyToCacheDirectory?: boolean;
    multiple?: boolean;
  }) => Promise<{
    canceled: boolean;
    assets?: Array<{ uri: string; name?: string | null; mimeType?: string | null }>;
  }>;
};

let DocumentPickerMod: DocumentPickerModule | null = null;
try {
  DocumentPickerMod = require("expo-document-picker") as DocumentPickerModule;
} catch {
  DocumentPickerMod = null;
}

function tomorrowDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function toIstDateKey(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function formatExpiryLabel(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate;
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function guessMime(name: string, fallback?: string | null): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return fallback?.trim() || "image/jpeg";
}

export function MerchantLicenseUploadSheet({
  visible,
  storeId,
  token,
  initialPrefix,
  onClose,
  onUploaded,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<LicenseDocumentActionItem[]>([]);
  const [selected, setSelected] = useState<LicenseDocumentActionItem | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [oldExpiryDate, setOldExpiryDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileMime, setFileMime] = useState<string | null>(null);
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [showMediaPreview, setShowMediaPreview] = useState(false);

  const uploadable = useMemo(
    () =>
      items.filter(
        (i) => i.status === "expired" || i.status === "expiring_soon" || i.status === "pending_verification"
      ),
    [items]
  );

  const applyDoc = useCallback((doc: LicenseDocumentActionItem) => {
    setSelected(doc);
    setDocumentNumber(doc.document_number?.trim() || "");
    setOldExpiryDate(doc.expiry_date?.trim() || "");
    setExpiryDate("");
    setFileUri(null);
    setFileName(null);
    setFileMime(null);
    setShowExpiryPicker(false);
    setShowMediaPreview(false);
  }, []);

  const load = useCallback(async () => {
    if (!storeId || !token) return;
    setLoading(true);
    try {
      const data = await fetchLicenseDocumentsStatus(storeId, token);
      const list =
        (data.uploadable_items?.length ? data.uploadable_items : null) ??
        (data.action_items?.length ? data.action_items : null) ??
        [...(data.license_expired_documents ?? []), ...(data.license_pending_verification ?? [])];
      setItems(list);
      if (initialPrefix) {
        const hit = list.find((x) => x.prefix === initialPrefix);
        if (hit) applyDoc(hit);
      }
    } catch (e) {
      Alert.alert("Could not load documents", e instanceof Error ? e.message : "Try again");
    } finally {
      setLoading(false);
    }
  }, [storeId, token, initialPrefix, applyDoc]);

  useEffect(() => {
    if (!visible) return;
    setSelected(null);
    setFileUri(null);
    setFileName(null);
    setFileMime(null);
    setDocumentNumber("");
    setOldExpiryDate("");
    setExpiryDate("");
    setShowExpiryPicker(false);
    setShowMediaPreview(false);
    void load();
  }, [visible, load]);

  const pickImage = async () => {
    const ImagePicker = await import("expo-image-picker");
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
    if (perm && perm.status !== "granted") {
      Alert.alert("Permission needed", "Allow photo access to upload your licence.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.92,
    });
    if (result.canceled || !result.assets?.[0]?.uri) return;
    const asset = result.assets[0];
    const name = asset.fileName ?? `licence-${Date.now()}.jpg`;
    setFileUri(asset.uri);
    setFileName(name);
    setFileMime(guessMime(name, asset.mimeType));
  };

  const pickPdf = async () => {
    if (!DocumentPickerMod?.getDocumentAsync) {
      Alert.alert("PDF picker unavailable", "Choose a photo of the licence instead.");
      await pickImage();
      return;
    }
    try {
      const result = await DocumentPickerMod.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      const name = asset.name ?? `licence-${Date.now()}.pdf`;
      setFileUri(asset.uri);
      setFileName(name);
      setFileMime(guessMime(name, asset.mimeType));
    } catch {
      Alert.alert("PDF picker unavailable", "Choose a photo of the licence instead.");
      await pickImage();
    }
  };

  const pickFile = () => {
    if (!DocumentPickerMod?.getDocumentAsync) {
      void pickImage();
      return;
    }
    Alert.alert("Upload document", "Photo or PDF of the licence.", [
      { text: "Cancel", style: "cancel" },
      { text: "Photo", onPress: () => void pickImage() },
      { text: "PDF / file", onPress: () => void pickPdf() },
    ]);
  };

  const isPdfFile =
    (fileMime ?? "").toLowerCase().includes("pdf") ||
    (fileName ?? "").toLowerCase().endsWith(".pdf");

  const viewPickedMedia = async () => {
    if (!fileUri) return;
    if (isPdfFile) {
      try {
        const can = await Linking.canOpenURL(fileUri);
        if (can) {
          await Linking.openURL(fileUri);
          return;
        }
      } catch {
        /* fall through */
      }
      Alert.alert("Cannot preview PDF", "Choose a photo of the licence to preview it here.");
      return;
    }
    setShowMediaPreview(true);
  };

  const submit = async () => {
    if (!selected || !fileUri) {
      Alert.alert("Missing file", "Choose a clear photo or PDF of your licence.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim())) {
      Alert.alert("Expiry required", "Pick a future expiry date.");
      return;
    }
    setUploading(true);
    try {
      await uploadLicenseDocument(storeId, token, {
        docType: selected.prefix,
        fileUri,
        fileName: fileName ?? undefined,
        mimeType: fileMime ?? undefined,
        documentNumber: documentNumber.trim() || undefined,
        expiryDate: expiryDate.trim(),
      });
      onUploaded();
      onClose();
    } catch (e) {
      Alert.alert("Upload failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setUploading(false);
    }
  };

  const expiryPickerValue = expiryDate
    ? new Date(`${expiryDate}T12:00:00+05:30`)
    : tomorrowDate();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TypographyVariantProvider variant="brand">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Renew expired licence</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color={GatiMitraMerchant.primary} />
          ) : selected ? (
            <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
              <Text style={styles.docLabel}>{selected.label}</Text>
              <Text style={styles.hint}>
                Upload an updated licence with a future expiry date. Verification may take up to 24 hours.
              </Text>
              <Text style={styles.fieldLabel}>Licence number</Text>
              <TextInput
                value={documentNumber}
                onChangeText={setDocumentNumber}
                placeholder="Enter licence number"
                style={styles.input}
                placeholderTextColor={GatiMitraMerchant.textSecondary}
              />
              <View style={styles.dateCols}>
                <View style={styles.dateCol}>
                  <Text style={styles.fieldLabel}>Current expiry</Text>
                  <View style={[styles.input, styles.inputReadonly]} pointerEvents="none">
                    <Text style={oldExpiryDate ? styles.dateValueOld : styles.datePlaceholder}>
                      {oldExpiryDate ? formatExpiryLabel(oldExpiryDate) : "—"}
                    </Text>
                  </View>
                </View>
                <View style={styles.dateCol}>
                  <Text style={styles.fieldLabel}>New expiry</Text>
                  <Pressable
                    style={styles.input}
                    onPress={() => {
                      if (!NativeDateTimePicker) {
                        Alert.alert("Not available", "Date picker is not available on this device.");
                        return;
                      }
                      setShowExpiryPicker(true);
                    }}
                  >
                    <View style={styles.dateRow}>
                      <Text style={expiryDate ? styles.dateValue : styles.datePlaceholder}>
                        {expiryDate ? formatExpiryLabel(expiryDate) : "Select date"}
                      </Text>
                      <Ionicons name="calendar-outline" size={18} color={GatiMitraMerchant.navy} />
                    </View>
                  </Pressable>
                </View>
              </View>
              <View style={styles.mediaRow}>
                <Pressable
                  style={[styles.pickBtn, fileUri ? styles.pickBtnCompact : styles.pickBtnFull]}
                  onPress={pickFile}
                >
                  <Ionicons name="cloud-upload-outline" size={20} color={GatiMitraMerchant.primary} />
                  <Text style={styles.pickBtnText} numberOfLines={1}>
                    {fileUri ? "Change file" : "Choose photo or PDF"}
                  </Text>
                </Pressable>
                {fileUri ? (
                  <Pressable style={styles.viewMediaBtn} onPress={() => void viewPickedMedia()}>
                    <Ionicons name="eye-outline" size={18} color="#fff" />
                    <Text style={styles.viewMediaText}>View media</Text>
                  </Pressable>
                ) : null}
              </View>
              {fileName ? (
                <Text style={styles.fileName} numberOfLines={1}>
                  {fileName}
                </Text>
              ) : null}
              <Pressable
                style={[styles.submitBtn, uploading && styles.submitDisabled]}
                disabled={uploading}
                onPress={() => void submit()}
              >
                {uploading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Upload for verification</Text>
                )}
              </Pressable>
              <Pressable onPress={() => setSelected(null)} style={styles.backLink}>
                <Text style={styles.backLinkText}>← All expired documents</Text>
              </Pressable>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.body}>
              {uploadable.length === 0 ? (
                <Text style={styles.hint}>No expired licences need upload right now.</Text>
              ) : (
                uploadable.map((doc) => (
                  <Pressable key={doc.prefix} style={styles.row} onPress={() => applyDoc(doc)}>
                    <Ionicons name="alert-circle" size={20} color="#DC2626" />
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{doc.label}</Text>
                      {doc.expiry_date ? (
                        <Text style={styles.rowSub}>Expired {formatExpiryLabel(doc.expiry_date)}</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textSecondary} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          )}
        </View>
        {showMediaPreview && fileUri && !isPdfFile ? (
          <View style={styles.previewOverlay}>
            <Pressable style={styles.previewBackdrop} onPress={() => setShowMediaPreview(false)} />
            <Pressable
              style={styles.previewClose}
              onPress={() => setShowMediaPreview(false)}
              accessibilityLabel="Close preview"
            >
              <Ionicons name="close" size={22} color="#fff" />
            </Pressable>
            <Image source={{ uri: fileUri }} style={styles.previewImage} resizeMode="contain" />
          </View>
        ) : null}
      </View>

      {showExpiryPicker && NativeDateTimePicker ? (
        Platform.OS === "ios" ? (
          <View style={styles.iosPickerWrap}>
            <View style={styles.iosPickerBar}>
              <Pressable onPress={() => setShowExpiryPicker(false)}>
                <Text style={styles.iosPickerDone}>Done</Text>
              </Pressable>
            </View>
            <NativeDateTimePicker
              value={Number.isNaN(expiryPickerValue.getTime()) ? tomorrowDate() : expiryPickerValue}
              mode="date"
              display="spinner"
              minimumDate={tomorrowDate()}
              onChange={(_event: { type?: string }, date?: Date) => {
                if (!date) return;
                setExpiryDate(toIstDateKey(date));
              }}
            />
          </View>
        ) : (
          <NativeDateTimePicker
            value={Number.isNaN(expiryPickerValue.getTime()) ? tomorrowDate() : expiryPickerValue}
            mode="date"
            display="default"
            minimumDate={tomorrowDate()}
            onChange={(event: { type?: string }, date?: Date) => {
              if (event?.type === "dismissed") {
                setShowExpiryPicker(false);
                return;
              }
              if (date) {
                setExpiryDate(toIstDateKey(date));
                setShowExpiryPicker(false);
              }
            }}
          />
        )
      ) : null}
      </TypographyVariantProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#fff",
    borderTopLeftRadius: CARD_RADIUS + 4,
    borderTopRightRadius: CARD_RADIUS + 4,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  title: { fontSize: 18, fontWeight: "700", fontFamily: FONT_LORA_BOLD, color: GatiMitraMerchant.textPrimary },
  body: { padding: H_PADDING, gap: 10 },
  docLabel: { fontSize: 16, fontWeight: "700", fontFamily: FONT_LORA_BOLD, color: GatiMitraMerchant.textPrimary },
  hint: { fontSize: 13, fontFamily: FONT_LORA, color: GatiMitraMerchant.textSecondary, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: "600", fontFamily: FONT_LORA_BOLD, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: FONT_POPPINS,
    color: GatiMitraMerchant.textPrimary,
  },
  inputReadonly: {
    backgroundColor: "#F3F4F6",
  },
  dateCols: {
    flexDirection: "row",
    gap: 10,
  },
  dateCol: {
    flex: 1,
    minWidth: 0,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  dateValue: { fontSize: 13, fontFamily: FONT_POPPINS_BOLD, color: GatiMitraMerchant.textPrimary, fontWeight: "600", flexShrink: 1 },
  dateValueOld: { fontSize: 13, fontFamily: FONT_POPPINS, color: GatiMitraMerchant.textSecondary, fontWeight: "600" },
  datePlaceholder: { fontSize: 13, fontFamily: FONT_LORA, color: GatiMitraMerchant.textSecondary },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  pickBtnFull: {
    flex: 1,
  },
  pickBtnCompact: {
    flex: 1,
    minWidth: 0,
  },
  mediaRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginTop: 8,
  },
  viewMediaBtn: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  viewMediaText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: FONT_LORA_BOLD,
  },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 20,
  },
  previewBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  previewClose: {
    position: "absolute",
    top: 16,
    right: 16,
    zIndex: 2,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "92%",
    height: "72%",
  },
  pickBtnText: { fontSize: 14, fontWeight: "600", fontFamily: FONT_LORA_BOLD, color: GatiMitraMerchant.primary },
  fileName: { fontSize: 12, fontFamily: FONT_LORA, color: GatiMitraMerchant.textSecondary },
  submitBtn: {
    backgroundColor: GatiMitraMerchant.navy,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.7 },
  submitText: { color: "#fff", fontSize: 15, fontWeight: "700", fontFamily: FONT_LORA_BOLD },
  backLink: { paddingVertical: 12, alignItems: "center" },
  backLinkText: { color: GatiMitraMerchant.primary, fontWeight: "600", fontFamily: FONT_LORA_BOLD },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 14, fontWeight: "600", fontFamily: FONT_LORA_BOLD, color: GatiMitraMerchant.textPrimary },
  rowSub: { fontSize: 12, fontFamily: FONT_POPPINS, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  iosPickerWrap: {
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  iosPickerBar: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  iosPickerDone: { fontSize: 16, fontWeight: "700", fontFamily: FONT_LORA_BOLD, color: GatiMitraMerchant.navy },
});
