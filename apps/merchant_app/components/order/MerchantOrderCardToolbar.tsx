import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { formatOrderIdDisplay } from "@/components/order/orderFormatters";

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
  const prefix = body.length > 4 ? body.slice(0, -4) : body;
  const last4 = body.length > 4 ? body.slice(-4) : "";

  const onCopy = async () => {
    await Clipboard.setStringAsync(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View style={styles.row}>
      <Text style={styles.hash}>#</Text>
      <Text style={styles.idMain}>{prefix}</Text>
      {last4 ? <Text style={styles.idLast4}>{last4}</Text> : null}
      <Pressable onPress={() => void onCopy()} hitSlop={8} style={styles.copyBtn}>
        <Ionicons
          name={copied ? "checkmark" : "copy-outline"}
          size={15}
          color={copied ? "#16A34A" : "#666666"}
        />
      </Pressable>
    </View>
  );
}

type ToolbarProps = {
  onSpeak: () => void;
  onMenu: () => void;
  speakingActive?: boolean;
};

export function MerchantOrderCardToolbar({ onSpeak, onMenu, speakingActive }: ToolbarProps) {
  return (
    <View style={styles.toolbar}>
      <Pressable
        onPress={onSpeak}
        style={({ pressed }) => [
          styles.iconBtn,
          speakingActive && styles.iconBtnSpeaking,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={speakingActive ? "volume-high" : "volume-high-outline"}
          size={18}
          color={speakingActive ? "#047857" : "#444444"}
        />
      </Pressable>
      <Pressable onPress={onMenu} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
        <Ionicons name="ellipsis-vertical" size={18} color="#444444" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 1, minWidth: 0 },
  hash: { fontSize: 18, fontWeight: "800", color: "#1A1A1A" },
  idMain: { fontSize: 18, fontWeight: "800", color: "#1A1A1A" },
  idLast4: { fontSize: 18, fontWeight: "800", color: "#1A1A1A" },
  copyBtn: { marginLeft: 6, padding: 4 },
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
