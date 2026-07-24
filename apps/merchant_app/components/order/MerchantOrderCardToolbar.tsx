import { useState } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";
import { FormattedOrderId } from "@/components/order/FormattedOrderId";

const MINT_GREEN = "#98FF98";
const MINT_GREEN_BORDER = "#4ADE80";

type Props = {
  formattedOrderId: string | null | undefined;
  fallbackOrderId: number;
};

export function MerchantOrderIdRow({ formattedOrderId, fallbackOrderId }: Props) {
  const [copied, setCopied] = useState(false);
  const display = formatOrderIdDisplay(formattedOrderId, fallbackOrderId);
  const body = display.replace(/^#?/i, "");

  const onCopy = async () => {
    await Clipboard.setStringAsync(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.row}>
      <FormattedOrderId
        formattedOrderId={formattedOrderId}
        fallbackCoreId={0}
        size="md"
        showHash
      />
      <Pressable
        onPress={() => void onCopy()}
        hitSlop={8}
        style={styles.copyBtn}
        disabled={!body}
      >
        <Ionicons
          name={copied ? "checkmark" : "copy-outline"}
          size={15}
          color={copied ? "#16A34A" : body ? "#666666" : "#B0B0B0"}
        />
      </Pressable>
    </View>
  );
}

type ToolbarProps = {
  onPrint?: () => void;
  onSpeak: () => void;
  onMenu: () => void;
  speakingActive?: boolean;
};

/** Printer · Speak · ⋮ — live + last-24h completed cards. */
export function MerchantOrderCardToolbar({
  onPrint,
  onSpeak,
  onMenu,
  speakingActive,
}: ToolbarProps) {
  return (
    <View style={styles.toolbar}>
      {onPrint ? (
        <Pressable
          onPress={onPrint}
          style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Print kitchen order ticket"
        >
          <Ionicons name="print-outline" size={18} color="#444444" />
        </Pressable>
      ) : null}
      <Pressable
        onPress={onSpeak}
        style={({ pressed }) => [
          styles.iconBtn,
          speakingActive && styles.iconBtnSpeaking,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Read item names aloud"
      >
        <Ionicons
          name={speakingActive ? "volume-high" : "volume-high-outline"}
          size={18}
          color={speakingActive ? "#047857" : "#444444"}
        />
      </Pressable>
      <Pressable
        onPress={onMenu}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Order options"
      >
        <Ionicons name="ellipsis-vertical" size={18} color="#444444" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0, flexShrink: 1 },
  copyBtn: { padding: 4 },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F0F0F0",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSpeaking: {
    backgroundColor: MINT_GREEN,
    borderWidth: 1.5,
    borderColor: MINT_GREEN_BORDER,
  },
  pressed: { opacity: 0.85 },
});
