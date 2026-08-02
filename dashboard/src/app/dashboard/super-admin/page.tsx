"use client";
import { useAppPathname } from "@/hooks/useAppSearchParams";

import React from "react";
import Link from "next/link";

import dynamic from "next/dynamic";

interface AdminOption {
  name: string;
  href: string;
  description: string;
  color: string;
  bgColor: string;
  Icon: React.ComponentType<{ className?: string }>;
}

// Icons (dynamic imports)
const UsersIcon = dynamic(async () => {
  const { Users } = await import("lucide-react");
  return (props: { className?: string }) => <Users {...props} />;
});

const PaymentsIcon = dynamic(async () => {
  const { CreditCard } = await import("lucide-react");
  return (props: { className?: string }) => <CreditCard {...props} />;
});

const OffersIcon = dynamic(async () => {
  const { Gift } = await import("lucide-react");
  return (props: { className?: string }) => <Gift {...props} />;
});

const AgentsIcon = dynamic(async () => {
  const { UserCog } = await import("lucide-react");
  return (props: { className?: string }) => <UserCog {...props} />;
});

const TicketSettingsIcon = dynamic(async () => {
  const { FolderGit2 } = await import("lucide-react");
  return (props: { className?: string }) => <FolderGit2 {...props} />;
});

const CategoriesIcon = dynamic(async () => {
  const { LayoutGrid } = await import("lucide-react");
  return (props: { className?: string }) => <LayoutGrid {...props} />;
});

const AppImagesIcon = dynamic(async () => {
  const { Image } = await import("lucide-react");
  return (props: { className?: string }) => <Image {...props} />;
});

// ✅ Your features
const BillingIcon = dynamic(async () => {
  const { Calculator } = await import("lucide-react");
  return (props: { className?: string }) => <Calculator {...props} />;
});

const DeliveryIcon = dynamic(async () => {
  const { Truck } = await import("lucide-react");
  return (props: { className?: string }) => <Truck {...props} />;
});

const GeoIcon = dynamic(async () => {
  const { MapPin } = await import("lucide-react");
  return (props: { className?: string }) => <MapPin {...props} />;
});

// ✅ Incoming feature
const StoreOnboardingIcon = dynamic(async () => {
  const { IndianRupee } = await import("lucide-react");
  return (props: { className?: string }) => <IndianRupee {...props} />;
});

const CommissionEngineIcon = dynamic(async () => {
  const { Percent } = await import("lucide-react");
  return (props: { className?: string }) => <Percent {...props} />;
});

const PushIcon = dynamic(async () => {
  const { BellRing } = await import("lucide-react");
  return (props: { className?: string }) => <BellRing {...props} />;
});

const OrderAcceptanceIcon = dynamic(async () => {
  const { TimerReset } = await import("lucide-react");
  return (props: { className?: string }) => <TimerReset {...props} />;
});

const RuleEngineIcon = dynamic(async () => {
  const { Shield } = await import("lucide-react");
  return (props: { className?: string }) => <Shield {...props} />;
});

const CancellationReasonsIcon = dynamic(async () => {
  const { ListX } = await import("lucide-react");
  return (props: { className?: string }) => <ListX {...props} />;
});

const RiderVehicleTypesIcon = dynamic(async () => {
  const { Bike } = await import("lucide-react");
  return (props: { className?: string }) => <Bike {...props} />;
});

const RiderDocumentTypesIcon = dynamic(async () => {
  const { FileText } = await import("lucide-react");
  return (props: { className?: string }) => <FileText {...props} />;
});

const RiderDispatchRadiusIcon = dynamic(async () => {
  const { Radar } = await import("lucide-react");
  return (props: { className?: string }) => <Radar {...props} />;
});

const VerificationSetupIcon = dynamic(async () => {
  const { ShieldCheck } = await import("lucide-react");
  return (props: { className?: string }) => <ShieldCheck {...props} />;
});

const ReferralRewardsIcon = dynamic(async () => {
  const { Gift } = await import("lucide-react");
  return (props: { className?: string }) => <Gift {...props} />;
});

const adminOptions: AdminOption[] = [
  {
    name: "Users",
    href: "/dashboard/users",
    Icon: UsersIcon,
    description: "Manage system users, create IDs, and assign roles",
    color: "text-blue-600",
    bgColor: "bg-blue-50 hover:bg-blue-100",
  },
  {
    name: "Payments",
    href: "/dashboard/payments",
    Icon: PaymentsIcon,
    description: "Manage rider and merchant withdrawals and payments",
    color: "text-green-600",
    bgColor: "bg-green-50 hover:bg-green-100",
  },
  {
    name: "Subscription Plans",
    href: "/dashboard/offers",
    Icon: OffersIcon,
    description: "Manage subscription plans for merchants, users, and riders",
    color: "text-purple-600",
    bgColor: "bg-purple-50 hover:bg-purple-100",
  },
  {
    name: "Agents",
    href: "/dashboard/agents",
    Icon: AgentsIcon,
    description: "Track all agent actions and performance metrics",
    color: "text-orange-600",
    bgColor: "bg-orange-50 hover:bg-orange-100",
  },
  {
    name: "Ticket settings",
    href: "/dashboard/super-admin/ticket-settings",
    Icon: TicketSettingsIcon,
    description: "Manage ticket groups, tags, and reference data",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50 hover:bg-indigo-100",
  },
  {
    name: "Categories",
    href: "/dashboard/super-admin/customer-app-categories",
    Icon: CategoriesIcon,
    description: "Manage customer app categories",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50 hover:bg-cyan-100",
  },
  {
    name: "App images",
    href: "/dashboard/super-admin/app-images",
    Icon: AppImagesIcon,
    description: "Upload & manage static images for Customer, Rider & Merchant apps",
    color: "text-sky-700",
    bgColor: "bg-sky-50 hover:bg-sky-100",
  },
  {
    name: "Notifications v2",
    href: "/dashboard/super-admin/notifications",
    Icon: PushIcon,
    description: "Templates, campaigns, scheduled, history, analytics — the enterprise notification centre",
    color: "text-teal-700",
    bgColor: "bg-teal-50 hover:bg-teal-100",
  },
  {
    name: "Order acceptance",
    href: "/dashboard/super-admin/order-acceptance",
    Icon: OrderAcceptanceIcon,
    description: "Acceptance window + incoming sound per store",
    color: "text-slate-700",
    bgColor: "bg-slate-50 hover:bg-slate-100",
  },
  {
    name: "Financial rule engine",
    href: "/dashboard/super-admin/rule-engine",
    Icon: RuleEngineIcon,
    description: "Cancellation, refund, penalty, settlement & dispute rules (centralized)",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 hover:bg-indigo-100",
  },
  {
    name: "Cancellation reasons",
    href: "/dashboard/super-admin/cancellation-reasons",
    Icon: CancellationReasonsIcon,
    description: "Manage order cancellation and refund rejection options by attribute",
    color: "text-red-700",
    bgColor: "bg-red-50 hover:bg-red-100",
  },
  {
    name: "Rider vehicle types",
    href: "/dashboard/super-admin/rider-onboarding-vehicle-types",
    Icon: RiderVehicleTypesIcon,
    description: "Manage rider onboarding vehicle options, icons, flows, and document rules",
    color: "text-teal-700",
    bgColor: "bg-teal-50 hover:bg-teal-100",
  },
  {
    name: "Rider document types",
    href: "/dashboard/super-admin/rider-onboarding-document-types",
    Icon: RiderDocumentTypesIcon,
    description: "Manage DL, RC, rental proof and other upload documents for rider onboarding",
    color: "text-sky-700",
    bgColor: "bg-sky-50 hover:bg-sky-100",
  },
  {
    name: "Rider assignment controls",
    href: "/dashboard/super-admin/rider-assignment-controls",
    Icon: GeoIcon,
    description:
      "Assignment limits, geo-fenced milestones, and dispatch wave settings (food / parcel / ride)",
    color: "text-indigo-700",
    bgColor: "bg-indigo-50 hover:bg-indigo-100",
  },
  {
    name: "Real-time tracking & geo-scoping",
    href: "/dashboard/super-admin/tracking-config",
    Icon: GeoIcon,
    description:
      "Tracking interval, geo-engine thresholds & rule toggles",
    color: "text-teal-700",
    bgColor: "bg-teal-50 hover:bg-teal-100",
  },
  {
    name: "Geo-engine violations",
    href: "/dashboard/super-admin/tracking-violations",
    Icon: GeoIcon,
    description:
      "Review no-movement / route-deviation / wrong-direction violations (penalize / dismiss)",
    color: "text-rose-700",
    bgColor: "bg-rose-50 hover:bg-rose-100",
  },

  // ✅ YOUR MODULES
  {
    name: "Billing rules",
    href: "/dashboard/super-admin/billing",
    Icon: BillingIcon,
    description: "Rule-based pricing & billing simulator",
    color: "text-amber-700",
    bgColor: "bg-amber-50 hover:bg-amber-100",
  },
  {
    name: "Delivery rate cards",
    href: "/dashboard/super-admin/delivery-rate-cards",
    Icon: DeliveryIcon,
    description: "Delivery pricing engine",
    color: "text-rose-700",
    bgColor: "bg-rose-50 hover:bg-rose-100",
  },
  {
    name: "Offers & coupons",
    href: "/dashboard/super-admin/offers-coupons",
    Icon: OffersIcon,
    description: "Manage offers and coupon codes",
    color: "text-fuchsia-700",
    bgColor: "bg-fuchsia-50 hover:bg-fuchsia-100",
  },
  {
    name: "Referral & Rewards",
    href: "/dashboard/super-admin/referral-rewards",
    Icon: ReferralRewardsIcon,
    description: "Customer GatiCash + rider wallet milestones, caps, fraud & live config",
    color: "text-teal-700",
    bgColor: "bg-teal-50 hover:bg-teal-100",
  },
  {
    name: "Geo & pincodes",
    href: "/dashboard/super-admin/geo",
    Icon: GeoIcon,
    description: "Geo hierarchy, delivery slabs & fallback rates",
    color: "text-teal-700",
    bgColor: "bg-teal-50 hover:bg-teal-100",
  },

  // ✅ INCOMING MODULE (merged)
  {
    name: "Onboarding fee & Mx Agreement",
    href: "/dashboard/super-admin/store-onboarding-fee",
    Icon: StoreOnboardingIcon,
    description: "Onboarding fee, commission config & merchant agreement",
    color: "text-violet-600",
    bgColor: "bg-violet-50 hover:bg-violet-100",
  },
  {
    name: "Commission engine",
    href: "/dashboard/super-admin/commission",
    Icon: CommissionEngineIcon,
    description: "Default %, plan benefits, per-store overrides, audit log",
    color: "text-violet-700",
    bgColor: "bg-violet-50 hover:bg-violet-100",
  },
  {
    name: "Ride billing & wallet",
    href: "/dashboard/super-admin/ride-billing-wallet",
    Icon: BillingIcon,
    description:
      "Ride settlement engine, cash toggle, negative-wallet thresholds & policy audit trail",
    color: "text-amber-700",
    bgColor: "bg-amber-50 hover:bg-amber-100",
  },

  // Document verification (Cashfree auto + manual fallback + agent workflow).
  // Single entry-point into the verification hub — inside, the four sub-tools
  // are laid out as their own cards: Policy Center, Analytics, Rider queue,
  // Merchant queue.
  {
    name: "Verification",
    href: "/dashboard/super-admin/verification",
    Icon: VerificationSetupIcon,
    description: "Auto/manual policy controls, verification analytics, and rider + merchant agent queues.",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50 hover:bg-emerald-100",
  },
];

interface AdminCardProps {
  option: AdminOption;
  isActive: boolean;
}

const AdminCard = React.memo(function AdminCard({ option, isActive }: AdminCardProps) {
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
});

const AdminGrid = React.memo(function AdminGrid() {
  const pathname = useAppPathname();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {adminOptions.map((option) => {
        const isActive = pathname === option.href;
        return <AdminCard key={option.name} option={option} isActive={isActive} />;
      })}
    </div>
  );
});

export default function SuperAdminPage() {
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AdminGrid />
    </div>
  );
}