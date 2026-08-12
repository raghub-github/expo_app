import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  View,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  addBankAccount,
  fetchVerificationModes,
  uploadBankProof,
  verifyBankAccount,
  verifyBankElectronic,
  type BankAccountPayload,
  type BankPolicyMode,
} from "@/services/bankAccountApi";

const IFSC_REGEX = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;
const PROOF_TYPES = [
  { id: "passbook" as const, label: "Passbook" },
  { id: "cancelled_cheque" as const, label: "Cancelled cheque" },
  { id: "bank_statement" as const, label: "Bank statement" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onAdded: () => void;
};

export function AddBankAccountSheet({ visible, onClose, onAdded }: Props) {
  const insets = useSafeAreaInsets();
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const storeId = selectedStore?.id ?? null;

  const [policyLoading, setPolicyLoading] = useState(false);
  const [bankPolicyMode, setBankPolicyMode] = useState<BankPolicyMode>("hybrid");
  const [forceManual, setForceManual] = useState(false);
  const [electronicVerified, setElectronicVerified] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proofUploading, setProofUploading] = useState(false);

  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [accountType, setAccountType] = useState<"savings" | "current" | "">("");
  const [proofType, setProofType] = useState<"passbook" | "cancelled_cheque" | "bank_statement" | "">("");
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofName, setProofName] = useState<string | null>(null);

  const reset = useCallback(() => {
    setForceManual(false);
    setElectronicVerified(false);
    setVerifyError(null);
    setHolderName("");
    setAccountNumber("");
    setConfirmAccountNumber("");
    setIfsc("");
    setBankName("");
    setBranchName("");
    setAccountType("");
    setProofType("");
    setProofUri(null);
    setProofName(null);
  }, []);

  useEffect(() => {
    if (!visible || !token) return;
    let cancelled = false;
    setPolicyLoading(true);
    fetchVerificationModes(token)
      .then((modes) => {
        if (cancelled) return;
        const raw = String(modes.bank_account ?? modes.bank ?? "hybrid").toLowerCase();
        const mode: BankPolicyMode =
          raw === "auto" || raw === "hybrid" || raw === "disabled" || raw === "manual" ? raw : "hybrid";
        setBankPolicyMode(mode);
        setForceManual(mode === "manual" || mode === "disabled");
      })
      .catch(() => {
        if (!cancelled) {
          setBankPolicyMode("hybrid");
          setForceManual(false);
        }
      })
      .finally(() => {
        if (!cancelled) setPolicyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token]);

  const isElectronicMode =
    (bankPolicyMode === "auto" || bankPolicyMode === "hybrid") && !forceManual && !electronicVerified;
  const showManualFields = bankPolicyMode === "manual" || forceManual || electronicVerified;
  const skipProof = electronicVerified;

  const handlePickProof = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync?.();
      if (perm && !perm.granted) {
        Alert.alert("Permission needed", "Allow photo library access to upload bank proof.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:
          (ImagePicker as { MediaTypeOptions?: { Images: string } }).MediaTypeOptions?.Images ?? "images",
        quality: 0.85,
      } as Parameters<typeof ImagePicker.launchImageLibraryAsync>[0]);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setProofUri(asset.uri);
      setProofName(asset.fileName || `bank_proof_${Date.now()}.jpg`);
    } catch {
      Alert.alert("Could not open gallery", "Please try again.");
    }
  };

  const handleElectronicVerify = async () => {
    if (!storeId || !token) return;
    const acc = accountNumber.trim().replace(/\D/g, "");
    const ifscCode = ifsc.trim().toUpperCase();
    if (!acc || acc.length < 6) {
      Alert.alert("Invalid account", "Enter a valid account number.");
      return;
    }
    if (!IFSC_REGEX.test(ifscCode)) {
      Alert.alert("Invalid IFSC", "Enter a valid IFSC code (e.g. HDFC0001234).");
      return;
    }
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await verifyBankElectronic(
        storeId,
        {
          account_number: acc,
          ifsc_code: ifscCode,
          account_holder_name: holderName.trim() || selectedStore?.store_name || undefined,
        },
        token
      );
      if (result.verified) {
        setAccountNumber(acc);
        setIfsc(ifscCode);
        setHolderName(String(result.name_at_bank || holderName || selectedStore?.store_name || "").trim());
        setBankName(String(result.bank_name || bankName || ifscCode.slice(0, 4)).trim());
        setElectronicVerified(true);
        setForceManual(false);
        Alert.alert("Verified", result.message || "Account verified — select account type and save.");
        return;
      }
      const msg = result.message || "Could not verify instantly.";
      setVerifyError(msg);
      if (bankPolicyMode === "hybrid") {
        setForceManual(true);
      } else {
        Alert.alert("Verification failed", msg);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Verification failed";
      setVerifyError(msg);
      if (bankPolicyMode === "hybrid") setForceManual(true);
      Alert.alert("Verification failed", msg);
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!storeId || !token) return;
    const trimmedName = holderName.trim();
    const trimmedAcc = accountNumber.trim();
    const trimmedConfirm = confirmAccountNumber.trim() || trimmedAcc;
    const trimmedIfsc = ifsc.trim().toUpperCase();
    const trimmedBank = bankName.trim();

    if (!trimmedName || !trimmedAcc) {
      Alert.alert("Missing details", "Account holder name and account number are required.");
      return;
    }
    if (!electronicVerified && trimmedAcc !== trimmedConfirm) {
      Alert.alert("Mismatch", "Account number and confirm account number must match.");
      return;
    }
    if (!trimmedIfsc || !trimmedBank) {
      Alert.alert("Missing details", "IFSC and bank name are required.");
      return;
    }
    if (!IFSC_REGEX.test(trimmedIfsc)) {
      Alert.alert("Invalid IFSC", "Enter a valid IFSC code.");
      return;
    }
    if (!accountType) {
      Alert.alert("Account type", "Select Savings or Current account type.");
      return;
    }

    let proofUrl: string | null = null;
    if (!skipProof) {
      if (!proofType) {
        Alert.alert("Bank proof", "Select proof type (passbook, cancelled cheque, or statement).");
        return;
      }
      if (!proofUri) {
        Alert.alert("Bank proof", "Upload a photo of your bank proof document.");
        return;
      }
    }

    setSaving(true);
    try {
      if (!skipProof && proofUri) {
        setProofUploading(true);
        proofUrl = await uploadBankProof(
          storeId,
          {
            uri: proofUri,
            name: proofName || "bank_proof.jpg",
            type: "image/jpeg",
          },
          token
        );
        setProofUploading(false);
      }

      const payload: BankAccountPayload = {
        payout_method: "bank",
        account_holder_name: trimmedName,
        account_number: trimmedAcc,
        ifsc_code: trimmedIfsc,
        bank_name: trimmedBank,
        branch_name: branchName.trim() || null,
        account_type: accountType,
        beneficiary_name: trimmedName,
        bank_proof_type: skipProof ? null : proofType || null,
        bank_proof_file_url: skipProof ? null : proofUrl,
      };

      const created = await addBankAccount(storeId, payload, token);

      if (electronicVerified && created?.id) {
        try {
          await verifyBankAccount(storeId, created.id, token);
        } catch {
          /* saved; merchant can retry verify from list */
        }
      }

      Alert.alert(
        "Added",
        electronicVerified
          ? "Bank account added and verified with Cashfree."
          : "Bank account added. Our team will review your proof if needed."
      );
      reset();
      onAdded();
      onClose();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not add account.");
    } finally {
      setSaving(false);
      setProofUploading(false);
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Text style={styles.title}>Add bank account</Text>
            <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={GatiMitraMerchant.textPrimary} />
            </Pressable>
          </View>

          {policyLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={GatiMitraMerchant.primary} />
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {electronicVerified ? (
                <View style={styles.verifiedBanner}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <Text style={styles.verifiedBannerText}>Verified with Cashfree</Text>
                </View>
              ) : null}

              {verifyError && !electronicVerified ? (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>{verifyError}</Text>
                </View>
              ) : null}

              {isElectronicMode ? (
                <>
                  <Field label="Account number" required>
                    <TextInput
                      style={styles.input}
                      value={accountNumber}
                      onChangeText={setAccountNumber}
                      placeholder="Enter account number"
                      placeholderTextColor={GatiMitraMerchant.textTertiary}
                      keyboardType="number-pad"
                    />
                  </Field>
                  <Field label="IFSC code" required>
                    <TextInput
                      style={styles.input}
                      value={ifsc}
                      onChangeText={(t) => setIfsc(t.toUpperCase())}
                      placeholder="e.g. HDFC0001234"
                      placeholderTextColor={GatiMitraMerchant.textTertiary}
                      autoCapitalize="characters"
                    />
                  </Field>
                  <Pressable
                    onPress={() => void handleElectronicVerify()}
                    disabled={verifying}
                    style={({ pressed }) => [styles.verifyBtn, pressed && styles.btnPressed, verifying && styles.btnDisabled]}
                  >
                    {verifying ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="shield-checkmark-outline" size={16} color="#fff" />
                        <Text style={styles.verifyBtnText}>Verify with Cashfree</Text>
                      </>
                    )}
                  </Pressable>
                </>
              ) : null}

              {showManualFields ? (
                <>
                  {!isElectronicMode ? (
                    <>
                      <Field label="Account number" required>
                        <TextInput
                          style={styles.input}
                          value={accountNumber}
                          onChangeText={setAccountNumber}
                          placeholder="Enter account number"
                          placeholderTextColor={GatiMitraMerchant.textTertiary}
                          keyboardType="number-pad"
                          editable={!electronicVerified}
                        />
                      </Field>
                      {!electronicVerified ? (
                        <Field label="Confirm account number" required>
                          <TextInput
                            style={styles.input}
                            value={confirmAccountNumber}
                            onChangeText={setConfirmAccountNumber}
                            placeholder="Re-enter account number"
                            placeholderTextColor={GatiMitraMerchant.textTertiary}
                            keyboardType="number-pad"
                          />
                        </Field>
                      ) : null}
                      <Field label="IFSC code" required>
                        <TextInput
                          style={styles.input}
                          value={ifsc}
                          onChangeText={(t) => setIfsc(t.toUpperCase())}
                          placeholder="e.g. HDFC0001234"
                          placeholderTextColor={GatiMitraMerchant.textTertiary}
                          autoCapitalize="characters"
                          editable={!electronicVerified}
                        />
                      </Field>
                    </>
                  ) : null}

                  <Field label="Account holder name" required>
                    <TextInput
                      style={styles.input}
                      value={holderName}
                      onChangeText={setHolderName}
                      placeholder="As per bank records"
                      placeholderTextColor={GatiMitraMerchant.textTertiary}
                      autoCapitalize="words"
                    />
                  </Field>
                  <Field label="Bank name" required>
                    <TextInput
                      style={styles.input}
                      value={bankName}
                      onChangeText={setBankName}
                      placeholder="e.g. HDFC Bank"
                      placeholderTextColor={GatiMitraMerchant.textTertiary}
                    />
                  </Field>
                  <Field label="Branch name">
                    <TextInput
                      style={styles.input}
                      value={branchName}
                      onChangeText={setBranchName}
                      placeholder="Optional"
                      placeholderTextColor={GatiMitraMerchant.textTertiary}
                    />
                  </Field>

                  <Text style={styles.fieldLabel}>
                    Account type <Text style={styles.req}>*</Text>
                  </Text>
                  <View style={styles.typeRow}>
                    {(["savings", "current"] as const).map((type) => (
                      <Pressable
                        key={type}
                        onPress={() => setAccountType(type)}
                        style={[styles.typeChip, accountType === type && styles.typeChipActive]}
                      >
                        <Text style={[styles.typeChipText, accountType === type && styles.typeChipTextActive]}>
                          {type === "savings" ? "Savings" : "Current"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {!skipProof ? (
                    <>
                      <Text style={styles.fieldLabel}>
                        Bank proof <Text style={styles.req}>*</Text>
                      </Text>
                      <View style={styles.proofTypeRow}>
                        {PROOF_TYPES.map((p) => (
                          <Pressable
                            key={p.id}
                            onPress={() => setProofType(p.id)}
                            style={[styles.proofChip, proofType === p.id && styles.proofChipActive]}
                          >
                            <Text style={[styles.proofChipText, proofType === p.id && styles.proofChipTextActive]}>
                              {p.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Pressable onPress={() => void handlePickProof()} style={styles.uploadBtn}>
                        <Ionicons name="cloud-upload-outline" size={18} color={GatiMitraMerchant.primary} />
                        <Text style={styles.uploadBtnText}>
                          {proofName ? proofName : "Upload bank proof photo"}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}

                  <Pressable
                    onPress={() => void handleSave()}
                    disabled={saving || proofUploading}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      (saving || proofUploading) && styles.btnDisabled,
                      pressed && !saving && styles.btnPressed,
                    ]}
                  >
                    {saving || proofUploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save bank account</Text>
                    )}
                  </Pressable>
                </>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>
        {label} {required ? <Text style={styles.req}>*</Text> : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "90%",
    paddingTop: 8,
  },
  grabber: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D1D5DB",
    marginBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
  },
  title: { fontSize: 17, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  loadingWrap: { paddingVertical: 40, alignItems: "center" },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: H_PADDING, paddingBottom: 12, gap: 0 },
  verifiedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    marginBottom: 12,
  },
  verifiedBannerText: { fontSize: 13, fontWeight: "700", color: "#15803d" },
  errorBanner: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: 12,
  },
  errorBannerText: { fontSize: 12, color: "#92400E", lineHeight: 17 },
  fieldGroup: { marginBottom: 10 },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  req: { color: GatiMitraMerchant.error },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    backgroundColor: "#fff",
  },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: "#4f46e5",
    marginBottom: 12,
    marginTop: 4,
  },
  verifyBtnText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  typeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
  },
  typeChipActive: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: "#ECFDF5",
  },
  typeChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  typeChipTextActive: { color: GatiMitraMerchant.primary },
  proofTypeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  proofChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  proofChipActive: { borderColor: GatiMitraMerchant.primary, backgroundColor: "#ECFDF5" },
  proofChipText: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  proofChipTextActive: { color: GatiMitraMerchant.primary },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    borderStyle: "dashed",
    marginBottom: 14,
  },
  uploadBtnText: { flex: 1, fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  saveBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.primary,
    marginTop: 4,
  },
  saveBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.55 },
});
