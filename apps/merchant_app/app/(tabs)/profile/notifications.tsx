/**
 * Merchant notification centre — powered by the shared InboxScreen from
 * @gatimitra/expo-push-kit.
 */
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { InboxScreen, type NotificationApiConfig } from "@gatimitra/expo-push-kit";
import { getConfig } from "@/config/env";
import { readMerchantAccessToken } from "@/lib/merchantSessionStorage";

const apiConfig: NotificationApiConfig = {
  baseUrl: getConfig().apiBaseUrl,
  getAuthHeader: async () => {
    const token = await readMerchantAccessToken();
    return token ? `Bearer ${token}` : null;
  },
};

export default function MerchantNotificationsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <InboxScreen
        apiConfig={apiConfig}
        onOpenDeepLink={(deepLink: string) => {
          try {
            if (deepLink.startsWith("http")) return;
            router.push(deepLink as never);
          } catch {/* ignore */}
        }}
      />
    </SafeAreaView>
  );
}
