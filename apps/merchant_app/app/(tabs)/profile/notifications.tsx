/**
 * Legacy profile path — Preferences used to wrongly open this as an inbox.
 * Always send users to the full-screen notification centre (no tab bar / Flow).
 */
import { Redirect } from "expo-router";

export default function ProfileNotificationsRedirect() {
  return <Redirect href="/notifications" />;
}
