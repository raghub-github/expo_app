/**
 * Shared alternate-contact picker: contacts list → name edit sheet → save API.
 */

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";
import { Alert, Modal, StyleSheet, TouchableOpacity, View } from "react-native";
import { AppText } from "@/components/AppText";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { ContactListSheet } from "@/features/ride/ContactListSheet";
import { AlternateContactNameSheet } from "@/components/orders/AlternateContactNameSheet";
import { orderService } from "@/services/order.service";
import { GatiMitraColors } from "@/constants/gatimitra";

const CARD = GatiMitraColors.cardSurface;
const TEXT = GatiMitraColors.textPrimaryNew;
const MUTED = GatiMitraColors.textSecondary;
const GREEN = GatiMitraColors.emerald;

export type AlternateContactFlowRef = {
  open: () => void;
};

type Props = {
  orderId: string;
  hasAlternateContact: boolean;
  canUpdateAlternateContact?: boolean;
  onSuccess?: () => void;
  extraInvalidateQueryKeys?: readonly (readonly unknown[])[];
  /**
   * `alternate` — food one-time alternate contact.
   * `receiver` — parcel drop receiver (can change until pickup).
   */
  mode?: "alternate" | "receiver";
};

export const AlternateContactFlow = forwardRef<AlternateContactFlowRef, Props>(
  function AlternateContactFlow(
    {
      orderId,
      hasAlternateContact,
      canUpdateAlternateContact = true,
      onSuccess,
      extraInvalidateQueryKeys = [],
      mode = "alternate",
    },
    ref
  ) {
    const queryClient = useQueryClient();
    const isReceiverMode = mode === "receiver";
    const [contactSheetVisible, setContactSheetVisible] = useState(false);
    const [nameSheetVisible, setNameSheetVisible] = useState(false);
    const [successVisible, setSuccessVisible] = useState(false);
    const [pendingContact, setPendingContact] = useState<{ name: string; phone: string } | null>(
      null
    );

    const saveMutation = useMutation({
      mutationFn: async (payload: { contactName: string; contactPhone: string }) =>
        orderService.setAlternateContact(orderId, payload),
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["order", orderId] }),
          queryClient.invalidateQueries({ queryKey: ["order-help"] }),
          ...extraInvalidateQueryKeys.map((key) =>
            queryClient.invalidateQueries({ queryKey: key as unknown[] })
          ),
        ]);
        setNameSheetVisible(false);
        setPendingContact(null);
        setSuccessVisible(true);
        onSuccess?.();
      },
      onError: (err) => {
        setNameSheetVisible(false);
        setPendingContact(null);
        Alert.alert(
          isReceiverMode ? "Could not update receiver" : "Could not update contact",
          err instanceof Error ? err.message : "Please try again."
        );
      },
    });

    const open = useCallback(async () => {
      if (saveMutation.isPending) return;
      if (!canUpdateAlternateContact) {
        Alert.alert(
          isReceiverMode ? "Receiver update closed" : "Contact update closed",
          isReceiverMode
            ? "Receiver number can no longer be updated for this parcel."
            : "Alternate contact can no longer be updated for this order."
        );
        return;
      }
      if (!isReceiverMode && hasAlternateContact) {
        Alert.alert(
          "Alternate contact added",
          "You can add an alternate contact only once for this order."
        );
        return;
      }
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Contacts permission",
            isReceiverMode
              ? "Please allow access to contacts so you can pick a receiver number."
              : "Please allow access to contacts so you can pick an alternate number for this delivery."
          );
          return;
        }
        setContactSheetVisible(true);
      } catch {
        Alert.alert("Contacts", "Could not access contacts on this device.");
      }
    }, [
      canUpdateAlternateContact,
      hasAlternateContact,
      isReceiverMode,
      saveMutation.isPending,
    ]);

    useImperativeHandle(ref, () => ({ open }), [open]);

    const handleSelectContact = useCallback((contactName: string, rawPhone?: string) => {
      const name = contactName.trim();
      const phone = rawPhone?.replace(/[\s-]/g, "") ?? "";
      if (!name || !phone) {
        Alert.alert("Invalid contact", "Pick a contact that has a name and phone number.");
        return;
      }
      setContactSheetVisible(false);
      setPendingContact({ name, phone });
      setNameSheetVisible(true);
    }, []);

    const handleConfirmName = useCallback(
      async (editedName: string) => {
        if (!pendingContact) return;
        try {
          await saveMutation.mutateAsync({
            contactName: editedName,
            contactPhone: pendingContact.phone,
          });
        } catch {
          /* Alert handled in mutation onError */
        }
      },
      [pendingContact, saveMutation]
    );

    const handleCloseNameSheet = useCallback(() => {
      if (saveMutation.isPending) return;
      setNameSheetVisible(false);
      setPendingContact(null);
    }, [saveMutation.isPending]);

    return (
      <>
        <ContactListSheet
          visible={contactSheetVisible}
          onClose={() => setContactSheetVisible(false)}
          onSelectContact={handleSelectContact}
          title={isReceiverMode ? "Select receiver contact" : "Select alternate contact"}
          emptyText="No contacts with a phone number were found."
        />

        {pendingContact ? (
          <AlternateContactNameSheet
            visible={nameSheetVisible}
            initialName={pendingContact.name}
            phone={pendingContact.phone}
            saving={saveMutation.isPending}
            onClose={handleCloseNameSheet}
            onConfirm={handleConfirmName}
          />
        ) : null}

        <AlternateContactSuccessModal
          visible={successVisible}
          onClose={() => setSuccessVisible(false)}
          title={isReceiverMode ? "Receiver updated" : undefined}
          body={
            isReceiverMode
              ? "Delivery partner will call this number at drop."
              : undefined
          }
        />
      </>
    );
  }
);

function AlternateContactSuccessModal({
  visible,
  onClose,
  title,
  body,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  body?: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.successOverlay}>
        <View style={styles.successCard}>
          <View style={styles.successIconWrap}>
            <Ionicons name="checkmark" size={28} color="#fff" />
          </View>
          <AppText style={styles.successTitle}>
            {title ?? "Alternate number updated"}
          </AppText>
          <AppText style={styles.successBody}>
            {body ??
              "The delivery partner will now contact you on your alternate number."}
          </AppText>
          <TouchableOpacity style={styles.successBtn} onPress={onClose} activeOpacity={0.9}>
            <AppText style={styles.successBtnText}>OK</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  successCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: CARD,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 18,
    alignItems: "center",
  },
  successIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GREEN,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
  },
  successBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    textAlign: "center",
  },
  successBtn: {
    marginTop: 18,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  successBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: GREEN,
  },
});
