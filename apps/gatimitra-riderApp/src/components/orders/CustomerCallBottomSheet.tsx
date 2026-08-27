import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";

const REF_GREEN = "#22C55E";

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits.slice(0, 2)}xxxxxx`;
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91${digits.slice(2, 4)}xxxxxx`;
  }
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `+${digits.slice(0, 2)}xxxxxx`;
  return `+${digits.slice(0, Math.min(4, digits.length - 4))}xxxxxx`;
}

function normalizeTel(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return `+${digits}`;
}

type Props = {
  visible: boolean;
  onDismiss: () => void;
  customerName?: string | null;
  customerPhone?: string | null;
  customerPrimaryName?: string | null;
  customerPrimaryPhone?: string | null;
  customerAlternateName?: string | null;
  customerAlternatePhone?: string | null;
  customerPhoneMasked?: string | null;
  customerPrimaryPhoneMasked?: string | null;
  customerAlternatePhoneMasked?: string | null;
};

type ContactRow = {
  key: string;
  phone: string;
  masked: string;
  /** Alternate contact added for this delivery — show Primary badge. */
  isDeliveryPrimary?: boolean;
};

export function CustomerCallBottomSheet({
  visible,
  onDismiss,
  customerName,
  customerPhone,
  customerPrimaryPhone,
  customerAlternatePhone,
  customerPhoneMasked,
  customerPrimaryPhoneMasked,
  customerAlternatePhoneMasked,
}: Props) {
  const { t } = useTranslation();

  const rows = useMemo(() => {
    const list: ContactRow[] = [];
    const seen = new Set<string>();

    const add = (
      key: string,
      phone: string | null | undefined,
      maskedFromServer: string | null | undefined,
      isDeliveryPrimary = false
    ) => {
      const trimmed = phone?.trim();
      if (!trimmed) return;
      const digits = trimmed.replace(/\D/g, "");
      if (!digits || seen.has(digits)) return;
      seen.add(digits);
      list.push({
        key,
        phone: trimmed,
        masked: maskedFromServer?.trim() || maskPhone(trimmed),
        isDeliveryPrimary,
      });
    };

    const hasAlternate = Boolean(customerAlternatePhone?.trim());
    add("alternate", customerAlternatePhone, customerAlternatePhoneMasked, hasAlternate);
    add("primary", customerPrimaryPhone, customerPrimaryPhoneMasked);
    add("customer", customerPhone, customerPhoneMasked);

    return list;
  }, [
    customerAlternatePhone,
    customerAlternatePhoneMasked,
    customerPhone,
    customerPhoneMasked,
    customerPrimaryPhone,
    customerPrimaryPhoneMasked,
  ]);

  const dial = useCallback(
    (phone: string) => {
      void Linking.openURL(`tel:${normalizeTel(phone)}`).catch(() => {
        Alert.alert(
          t("orders.activeRide.callFailedTitle", "Could not call"),
          t("orders.activeRide.callFailedMessage", "Unable to open the phone dialer.")
        );
      });
    },
    [t]
  );

  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      maxHeightRatio={0.42}
      showOuterHandle={false}
      showFloatingClose
    >
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>
            {t("orders.customerCall.heading", "User Contact details")}
          </Text>
          {customerName?.trim() ? (
            <Text style={styles.customerName}>{customerName.trim()}</Text>
          ) : null}
        </View>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>
            {t("orders.ridePaymentWait.noPhone", "Phone unavailable")}
          </Text>
        </View>
      ) : (
      <View style={styles.list}>
        {rows.map((row) => (
          <Pressable
            key={row.key}
            style={styles.row}
            onPress={() => {
              dial(row.phone);
              onDismiss();
            }}
          >
            <View style={styles.iconWrap}>
              <Ionicons name="call" size={20} color={REF_GREEN} />
            </View>
            <View style={styles.rowTextCol}>
              <View style={styles.phoneLine}>
                <Text style={styles.rowPhone}>{row.masked}</Text>
                {row.isDeliveryPrimary ? (
                  <View style={styles.primaryBadge}>
                    <Text style={styles.primaryBadgeText}>
                      {t("orders.customerCall.primaryBadge", "Primary")}
                    </Text>
                  </View>
                ) : null}
              </View>
              {row.isDeliveryPrimary ? (
                <Text style={styles.rowHint}>
                  {t(
                    "orders.customerCall.alternateHint",
                    "Alternate number added for delivery"
                  )}
                </Text>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#9AA0A6" />
          </Pressable>
        ))}
      </View>
      )}
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EAED",
  },
  headerTextCol: {
    flex: 1,
    gap: 4,
    paddingRight: 8,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#1C1C1C",
  },
  customerName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#5F6368",
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8EAED",
    backgroundColor: "#ffffff",
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  phoneLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  rowPhone: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1C1C1C",
    letterSpacing: 0.3,
  },
  primaryBadge: {
    backgroundColor: "#ECFDF3",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rowHint: {
    marginTop: 4,
    fontSize: 12,
    color: "#828282",
    lineHeight: 16,
  },
  emptyWrap: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
});
