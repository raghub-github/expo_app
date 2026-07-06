"use client";

/**
 * Verification hub — single entry point from the super-admin landing.
 *
 * The four sub-tools live behind this page:
 *   • Policy Center       — per-doc / per-app auto ↔ manual switch
 *   • Analytics report    — request counts, success rates, filters
 *   • Rider agent queue   — manual-review workflow for rider docs
 *   • Merchant agent queue — same for merchant onboarding docs
 *
 * Kept intentionally quiet so the sub-tool cards are the visual focus.
 */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAppPathname } from "@/hooks/useAppSearchParams";

interface HubOption {
  name: string;
  href: string;
  description: string;
  color: string;
  bgColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const PolicyCenterIcon = dynamic(async () => {
  const { ShieldCheck } = await import("lucide-react");
  return (props: { className?: string }) => <ShieldCheck {...props} />;
});
const AnalyticsIcon = dynamic(async () => {
  const { BarChart3 } = await import("lucide-react");
  return (props: { className?: string }) => <BarChart3 {...props} />;
});
const RiderQueueIcon = dynamic(async () => {
  const { UserCheck } = await import("lucide-react");
  return (props: { className?: string }) => <UserCheck {...props} />;
});
const MerchantQueueIcon = dynamic(async () => {
  const { Store } = await import("lucide-react");
  return (props: { className?: string }) => <Store {...props} />;
});

const options: HubOption[] = [
  {
    name: "Policy Center",
    href: "/dashboard/super-admin/verification/policies",
    Icon: PolicyCenterIcon,
    description:
      "Switch each document between auto (Cashfree) and manual — per doc, per app, or all at once. Provider kill-switches sit here too.",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 hover:bg-emerald-100",
  },
  {
    name: "Analytics report",
    href: "/dashboard/super-admin/verification/analytics",
    Icon: AnalyticsIcon,
    description:
      "Requests by rider / merchant / document kind. Success, failure, manual-review counts. Filters + daily trends.",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 hover:bg-indigo-100",
  },
  {
    name: "Rider agent queue",
    href: "/dashboard/super-admin/verification/rider-queue",
    Icon: RiderQueueIcon,
    description:
      "Riders whose documents need agent review — take, verify, or reject with notes.",
    color: "text-sky-700",
    bgColor: "bg-sky-50 hover:bg-sky-100",
  },
  {
    name: "Merchant agent queue",
    href: "/dashboard/super-admin/verification/merchant-queue",
    Icon: MerchantQueueIcon,
    description:
      "Merchants whose onboarding documents need agent review.",
    color: "text-amber-700",
    bgColor: "bg-amber-50 hover:bg-amber-100",
  },
];

function HubCard({ option, isActive }: { option: HubOption; isActive: boolean }) {
  const { Icon } = option;
  return (
    <Link
      href={option.href}
      prefetch
      className={`rounded-lg border-2 p-6 transition-all duration-200 active:scale-[0.97] ${
        isActive
          ? "border-blue-500 shadow-lg"
          : "border-gray-200 hover:border-gray-300 hover:shadow-md"
      } ${option.bgColor} min-h-[120px]`}
    >
      <div className="flex items-start space-x-4">
        <div className={`p-3 rounded-lg bg-white ${option.color}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{option.name}</h3>
          <p className="text-sm text-gray-600">{option.description}</p>
        </div>
      </div>
    </Link>
  );
}

export default function VerificationHubPage() {
  const pathname = useAppPathname();
  return (
    <div className="space-y-4 w-full max-w-full overflow-x-hidden">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Super Admin</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Verification</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Cashfree auto-verify + manual fallback + agent workflow. Start with the Policy Center to switch a
          document from manual to auto; use the analytics report to watch success rates; agents work the two
          queues below when a document lands in manual review.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {options.map((opt) => (
          <HubCard key={opt.name} option={opt} isActive={pathname === opt.href} />
        ))}
      </div>
    </div>
  );
}
