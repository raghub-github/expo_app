/**
 * Full-page raise-ticket wizard (order pick → topic → details).
 */
import { useLocalSearchParams } from "expo-router";
import { RaiseTicketWizard, type RaiseTicketWizardStep } from "@/components/support/RaiseTicketWizard";

function parseStep(raw: string | string[] | undefined): RaiseTicketWizardStep {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "concerns" || v === "details") return v;
  return "pick_order";
}

export default function RaiseTicketWizardScreen() {
  const { step, noOrder } = useLocalSearchParams<{ step?: string; noOrder?: string }>();
  const noOrderMode = noOrder === "1" || noOrder === "true";

  return <RaiseTicketWizard initialStep={parseStep(step)} initialNoOrderMode={noOrderMode} />;
}
