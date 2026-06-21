/**
 * Profile → Legal → [docId] — renders one policy document.
 */

import { useLocalSearchParams } from "expo-router";
import { LegalDocViewer } from "@/components/LegalDocViewer";

export default function LegalDocScreen() {
  const { docId } = useLocalSearchParams<{ docId: string }>();
  return <LegalDocViewer docId={docId} backFallback="/profile/legal" />;
}
