import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { DismissibleBottomSheetShell } from "@/src/components/language/DismissibleBottomSheetShell";
import { RiderFonts } from "@/src/theme/fonts";
import {
  RIDER_AUTH_ACCENT,
  RIDER_AUTH_ACCENT_DARK,
  RIDER_AUTH_INK,
  RIDER_AUTH_MUTED,
} from "@/src/theme/riderAuthTheme";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onDismiss: () => void;
};

export function SessionEndedSheet({ visible, title, message, onDismiss }: Props) {
  return (
    <DismissibleBottomSheetShell
      visible={visible}
      onDismiss={onDismiss}
      fitContent
      showFloatingClose
      compactBottomInset
      sheetBottomPadding={24}
    >
      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="log-out-outline" size={26} color={RIDER_AUTH_INK} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onDismiss}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel="Continue"
        >
          <Text style={styles.ctaText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </DismissibleBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 22,
    paddingTop: 6,
    paddingBottom: 8,
    alignItems: "stretch",
  },
  iconWrap: {
    alignSelf: "center",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#C4E8D1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 22,
    color: RIDER_AUTH_INK,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 15,
    lineHeight: 22,
    color: RIDER_AUTH_MUTED,
    textAlign: "center",
    marginBottom: 20,
  },
  cta: {
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: RIDER_AUTH_ACCENT,
    borderWidth: 2,
    borderColor: RIDER_AUTH_ACCENT_DARK,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaText: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 18,
    color: RIDER_AUTH_INK,
  },
});
