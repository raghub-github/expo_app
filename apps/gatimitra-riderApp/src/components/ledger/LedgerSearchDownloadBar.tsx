import React from "react";
import { View, TextInput, Pressable, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  onDownload: () => void;
};

export function LedgerSearchDownloadBar({ value, onChangeText, onDownload }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.row}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder={t("ledger.searchPlaceholder", "Search transactions...")}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>
      <Pressable
        onPress={onDownload}
        style={({ pressed }) => [styles.downloadBtn, pressed && styles.downloadBtnPressed]}
      >
        <Ionicons name="download-outline" size={18} color="#374151" />
        <Text style={styles.downloadText}>{t("ledger.download", "Download")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontWeight: "400",
    color: "#111827",
    paddingVertical: 8,
  },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  downloadBtnPressed: {
    backgroundColor: "#F9FAFB",
  },
  downloadText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
});
