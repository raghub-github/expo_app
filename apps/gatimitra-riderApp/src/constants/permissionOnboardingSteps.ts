import type { PermissionStepKey } from "@/src/services/permissions/smartPermissionHandler";

export type PermissionOnboardingStep = {
  key: PermissionStepKey;
  title: string;
  description: string;
  microText: string;
  icon: string;
  gradient: [string, string];
};

/** Fixed first-launch permission screens — always shown in order (5 total). */
export const PERMISSION_ONBOARDING_STEPS: PermissionOnboardingStep[] = [
  {
    key: "location",
    title: "Location Access",
    description:
      "We need your location to show nearby orders, enable navigation, and track deliveries in real-time.",
    microText:
      "Allow location access. For continuous tracking, choose “Allow all the time” in settings if prompted.",
    icon: "📍",
    gradient: ["#14b8a6", "#0d9488"],
  },
  {
    key: "notifications",
    title: "Notifications",
    description:
      "Receive instant alerts about new orders, order updates, earnings, and important announcements.",
    microText:
      "After allowing, enable sound and vibration in notification settings for better order management.",
    icon: "🔔",
    gradient: ["#0ea5e9", "#0284c7"],
  },
  {
    key: "battery_optimization",
    title: "Battery Optimization",
    description:
      "Allow the app to run efficiently in the background so you receive order notifications on time.",
    microText:
      "Disabling battery optimization helps with continuous location tracking and timely notifications.",
    icon: "🔋",
    gradient: ["#f59e0b", "#d97706"],
  },
  {
    key: "background_running",
    title: "Background Running",
    description:
      "Allow the app to run in the background so you can receive orders even when the app is not active.",
    microText:
      "In app settings, enable background activity or remove background restrictions for GatiMitra.",
    icon: "🔄",
    gradient: ["#8b5cf6", "#7c3aed"],
  },
  {
    key: "display_over_apps",
    title: "Display Over Other Apps",
    description:
      "Allow the app to display over other apps for important order notifications and updates.",
    microText:
      "In Special app access, enable “Display over other apps” for GatiMitra.",
    icon: "📱",
    gradient: ["#ec4899", "#db2777"],
  },
];
