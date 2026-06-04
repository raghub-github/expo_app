import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export type RiderOnboardingFeeConfig = {
  standardOnboardingFee: string;
  discountedOnboardingFee: string;
  discountPercent: string;
  gstPercent: string;
  discountPeriodLabel: string;
  headline: string;
  subtitle: string;
  feeLabel: string;
  infoMessage: string;
  alertNotice: string;
  footerNote: string;
  payButtonText: string | null;
  subtotalPaise: number;
  gstAmountPaise: number;
  totalPaise: number;
};

const FALLBACK: RiderOnboardingFeeConfig = {
  standardOnboardingFee: "99",
  discountedOnboardingFee: "49",
  discountPercent: "50.51",
  gstPercent: "18",
  discountPeriodLabel: "for limited time",
  headline: "Onboarding Fee",
  subtitle: "Complete your onboarding by paying the registration fee",
  feeLabel: "One-time onboarding fee",
  infoMessage: "This fee covers document verification and account setup",
  alertNotice: "Pay the onboarding fee to complete registration.",
  footerNote: "The onboarding fee is non-refundable once verification begins.",
  payButtonText: null,
  subtotalPaise: 4900,
  gstAmountPaise: 882,
  totalPaise: 5782,
};

export function useOnboardingFeeConfig() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "onboarding", "fee-config"],
    queryFn: async (): Promise<RiderOnboardingFeeConfig> => {
      if (!session?.accessToken) return FALLBACK;
      try {
        return await getJson<RiderOnboardingFeeConfig>(
          `${API_BASE()}/v1/onboarding/fee-config`,
          { headers: { authorization: `Bearer ${session.accessToken}` } }
        );
      } catch (e) {
        console.warn("[useOnboardingFeeConfig] fetch failed, using fallback", e);
        return FALLBACK;
      }
    },
    enabled: Boolean(session?.accessToken),
    staleTime: 5 * 60_000,
    placeholderData: FALLBACK,
  });
}

export function formatRupeeFromPaise(paise: number): string {
  const r = paise / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}
