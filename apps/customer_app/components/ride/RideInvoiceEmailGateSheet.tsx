import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;

export type RideInvoiceEmailGateMode = "missing_email" | "unverified_email" | "confirm_send";

type Props = {
  visible: boolean;
  mode: RideInvoiceEmailGateMode | null;
  email?: string | null;
  sending?: boolean;
  onClose: () => void;
  onAddEmail: () => void;
  onVerifyEmail: () => void;
  onConfirmSend: () => void;
};

export function RideInvoiceEmailGateSheet({
  visible,
  mode,
  email,
  sending = false,
  onClose,
  onAddEmail,
  onVerifyEmail,
  onConfirmSend,
}: Props) {
  if (!mode) return null;

  const title =
    mode === "missing_email"
      ? "Add your email"
      : mode === "unverified_email"
        ? "Verify your email"
        : "Send ride invoice";

  const body =
    mode === "missing_email"
      ? "Add an email address to your GatiMitra profile. We need it to email your ride invoice."
      : mode === "unverified_email"
        ? `Verify ${email ?? "your email"} before we can send your ride invoice. This keeps your receipts secure.`
        : `We'll email your ride invoice to ${email ?? "your verified email"}.`;

  const primaryLabel =
    mode === "missing_email"
      ? "Add email"
      : mode === "unverified_email"
        ? "Verify email"
        : sending
          ? "Sending…"
          : "Send invoice";

  const onPrimary =
    mode === "missing_email"
      ? onAddEmail
      : mode === "unverified_email"
        ? onVerifyEmail
        : onConfirmSend;

  const iconName =
    mode === "confirm_send" ? ("mail-outline" as const) : ("shield-checkmark-outline" as const);

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.52} flushBottom>
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name={iconName} size={28} color={GREEN} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.bodyText}>{body}</Text>

        <TouchableOpacity
          style={[styles.primaryBtn, sending && styles.primaryBtnDisabled]}
          onPress={onPrimary}
          disabled={sending}
          activeOpacity={0.9}
        >
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>Not now</Text>
        </TouchableOpacity>
      </View>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  primaryBtn: {
    alignSelf: "stretch",
    backgroundColor: GREEN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  primaryBtnDisabled: {
    opacity: 0.75,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  secondaryBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
});
