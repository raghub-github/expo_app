/**
 * GatiCash FAQs — accessible only from wallet settings.
 */

import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { WalletSubpageHeader } from "@/components/wallet/WalletSubpageHeader";
import { GatiCashFaqAccordion } from "@/components/wallet/GatiCashFaqAccordion";
import { GATICASH_FAQS } from "@/constants/gatiCashFaqs";
import { useWalletDark } from "@/hooks/useWalletDark";

const PAGE_BG = "#F5F5F7";

export default function WalletFaqScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dark = useWalletDark();

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style={dark ? "light" : "dark"} backgroundColor={dark ? "#121212" : PAGE_BG} />
      <View style={[styles.screen, dark && { backgroundColor: "#121212" }]}>
        <WalletSubpageHeader title="GatiCash FAQs" onBack={() => router.back()} dark={dark} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <GatiCashFaqAccordion items={GATICASH_FAQS} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4 },
});
