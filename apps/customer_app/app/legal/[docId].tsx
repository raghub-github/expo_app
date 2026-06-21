/**
 * Public legal docs — reachable from login / onboarding without entering profile.
 */

import { useLocalSearchParams } from "expo-router";
import { LegalDocViewer } from "@/components/LegalDocViewer";

export default function PublicLegalDocScreen() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  return <LegalDocViewer docId={docId} backFallback="/(auth)/login" />;
}
