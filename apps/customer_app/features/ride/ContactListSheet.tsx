/**
 * Bottom sheet listing device contacts. Shown after contacts permission is granted.
 * User selects a contact to add as guest.
 */

import { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { GatiMitraColors } from "@/constants/gatimitra";

type ContactItem = {
  id: string;
  name: string;
  phone?: string;
};

type ContactListSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelectContact?: (name: string, phone?: string) => void;
  title?: string;
  emptyText?: string;
};

export function ContactListSheet({
  visible,
  onClose,
  onSelectContact,
  title = "Select a guest",
  emptyText = "No contacts found on this device.",
}: ContactListSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sheetHeight = Math.min(500, windowHeight * 0.7);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setError(null);
    Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      sort: Contacts.SortTypes.FirstName,
    })
      .then(({ data }) => {
        setContacts(
          data
            .map((c) => ({
              id: c.id ?? c.name,
              name: c.name ?? "Unknown",
              phone: c.phoneNumbers?.[0]?.number,
            }))
            .filter((c) => Boolean(c.name?.trim()) && Boolean(c.phone?.replace(/\D/g, "")))
        );
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load contacts");
      })
      .finally(() => setLoading(false));
  }, [visible]);

  const handleSelect = (item: ContactItem) => {
    const phone = item.phone?.replace(/[\s-]/g, "") ?? "";
    if (!phone) return;
    onSelectContact?.(item.name, phone);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent={Platform.OS === "android"}
    >
      <View style={styles.modalWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { height: sheetHeight, paddingBottom: insets.bottom + 16 },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={22} color={GatiMitraColors.textPrimary} />
            </TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={GatiMitraColors.emerald} />
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : contacts.length === 0 ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{emptyText}</Text>
            </View>
          ) : (
            <FlatList
              data={contacts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(item.name[0] ?? "?").toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactName}>{item.name}</Text>
                    {item.phone ? (
                      <Text style={styles.contactPhone}>{item.phone}</Text>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraColors.textSecondary} />
                </TouchableOpacity>
              )}
              style={styles.list}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GatiMitraColors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    ...GatiMitraColors.elevationShadow,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GatiMitraColors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
  },
  closeBtn: { padding: 4 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  errorWrap: { flex: 1, justifyContent: "center", padding: 24 },
  errorText: { fontSize: 15, color: GatiMitraColors.textSecondary, textAlign: "center" },
  list: { flex: 1 },
  listContent: { paddingBottom: 16 },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraColors.border,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraColors.mintSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.emerald,
  },
  contactInfo: { flex: 1 },
  contactName: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraColors.textPrimary,
  },
  contactPhone: {
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    marginTop: 2,
  },
});
