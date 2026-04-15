"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
    name: "Geo & pincodes",
    href: "/dashboard/super-admin/geo",
    Icon: GeoIcon,
    description: "Geo hierarchy & pricing rules",
    color: "text-teal-700",
    bgColor: "bg-teal-50 hover:bg-teal-100",
  },

  // ✅ INCOMING MODULE (merged)
  {
    name: "Store onboarding fee",
    href: "/dashboard/super-admin/store-onboarding-fee",
    Icon: StoreOnboardingIcon,
    description: "Onboarding fee & commission config",
    color: "text-violet-600",
    bgColor: "bg-violet-50 hover:bg-violet-100",
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
  const pathname = usePathname();

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