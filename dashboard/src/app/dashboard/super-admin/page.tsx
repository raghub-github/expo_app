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

// Icons are dynamically imported so they don't block the main Super Admin chunk.
const UsersIcon = dynamic(async () => {
  const { Users } = await import("lucide-react");
  return function UsersIcon(props: { className?: string }) {
    return <Users {...props} />;
  };
});

const PaymentsIcon = dynamic(async () => {
  const { CreditCard } = await import("lucide-react");
  return function PaymentsIcon(props: { className?: string }) {
    return <CreditCard {...props} />;
  };
});

const OffersIcon = dynamic(async () => {
  const { Gift } = await import("lucide-react");
  return function OffersIcon(props: { className?: string }) {
    return <Gift {...props} />;
  };
});

const AgentsIcon = dynamic(async () => {
  const { UserCog } = await import("lucide-react");
  return function AgentsIcon(props: { className?: string }) {
    return <UserCog {...props} />;
  };
});

const TicketSettingsIcon = dynamic(async () => {
  const { FolderGit2 } = await import("lucide-react");
  return function TicketSettingsIcon(props: { className?: string }) {
    return <FolderGit2 {...props} />;
  };
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
    name: "Offers",
    href: "/dashboard/offers",
    Icon: OffersIcon,
    description: "Manage offers, incentives, and banners for all apps",
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
    description: "Manage ticket groups, tags, and reference data for the ticket dashboard",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50 hover:bg-indigo-100",
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
  // Static-first navigation hub: no API calls, no effects, just instant UI.
  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <AdminGrid />
    </div>
  );
}
