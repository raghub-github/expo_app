/**
 * Customer notification centre — powered by the shared InboxScreen from
 * @gatimitra/expo-push-kit. Deep-link taps route via expo-router.
 */
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { InboxScreen, type InboxItem, type NotificationApiConfig } from "@gatimitra/expo-push-kit";
import { getConfig } from "@/config/env";
import { STORAGE_KEYS } from "@/constants";
import { getItem } from "@/utils/storage";

const apiConfig: NotificationApiConfig = {
  baseUrl: getConfig().apiBaseUrl,
  getAuthHeader: async () => {
    const token = await getItem(STORAGE_KEYS.AUTH_TOKEN);
    return token ? `Bearer ${token}` : null;
  },
};

export default function NotificationsScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <InboxScreen
        apiConfig={apiConfig}
        onOpenDeepLink={(deepLink: string, _item: InboxItem) => {
          try {
            if (deepLink.startsWith("http")) return;
            router.push(deepLink as never);
          } catch {/* ignore malformed deep links */}
        }}
      />
    </SafeAreaView>
  );
}
