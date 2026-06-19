/**
 * Bottom sheet — add cooking / kitchen request during live order tracking.
 */

import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import { orderService } from "@/services/order.service";

const MINT = GatiMitraColors.primaryMint;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const BORDER = GatiMitraColors.border;

type CookingRequestBottomSheetProps = {
  visible: boolean;
  orderId: string;
  restaurantName: string;
  existingInstructions?: string[];
  onClose: () => void;
  onAdded: (merchantInstructionsList: string[]) => void;
};

export function CookingRequestBottomSheet({
  visible,
  orderId,
  restaurantName,
  existingInstructions = [],
  onClose,
  onAdded,
}: CookingRequestBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);

  const handleSubmit = useCallback(async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      const res = await orderService.appendMerchantInstruction(orderId, trimmed);
      onAdded(res.merchantInstructionsList);
      onClose();
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not add your cooking request. Please try again.";
      Alert.alert("Unable to add request", message);
    } finally {
      setSubmitting(false);
    }
  }, [note, onAdded, onClose, orderId]);

  return (
    <StoreBottomSheetShell
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.72}
      keyboardAvoiding
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <Text style={styles.title}>Add cooking requests</Text>
        <Text style={styles.subtitle}>
          {restaurantName} will see this note while preparing your order.
        </Text>

        {existingInstructions.length > 0 ? (
          <View style={styles.existingWrap}>
            <Text style={styles.existingLabel}>Already added</Text>
            {existingInstructions.map((item) => (
              <Text key={item} style={styles.existingItem}>
                • {item}
              </Text>
            ))}
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          placeholder="E.g. less spicy, extra gravy, pack chutney separately"
          placeholderTextColor="#9CA3AF"
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          textAlignVertical="top"
          editable={!submitting}
          returnKeyType="done"
          blurOnSubmit
          onSubmitEditing={() => Keyboard.dismiss()}
        />

        <TouchableOpacity
          style={[styles.cta, (!note.trim() || submitting) && styles.ctaDisabled]}
          onPress={() => void handleSubmit()}
          disabled={!note.trim() || submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.ctaText}>Add request</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: TEXT,
  },
  subtitle: {
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
    lineHeight: 18,
  },
  existingWrap: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: GatiMitraColors.mintSoft,
  },
  existingLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: MUTED,
    marginBottom: 6,
  },
  existingItem: {
    fontSize: 13,
    color: TEXT,
    lineHeight: 18,
  },
  input: {
    marginTop: 16,
    minHeight: 110,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: TEXT,
    backgroundColor: "#FAFAFA",
  },
  cta: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: MINT,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: {
    opacity: 0.55,
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#fff",
  },
});
