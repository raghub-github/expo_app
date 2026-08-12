/**
 * Legacy profile path — redirect to Preferences (floating order pill settings).
 */
import { Redirect } from "expo-router";

export default function ProfileNotificationsRedirect() {
  return <Redirect href="/(tabs)/profile/preferences" />;
}
