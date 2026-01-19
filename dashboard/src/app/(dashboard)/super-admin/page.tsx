"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, CreditCard, Gift, UserCog } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface AdminOption {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  color: string;
  bgColor: string;
}

const adminOptions: AdminOption[] = [
  {
    name: "Users",
    href: "/dashboard/users",
    icon: Users,
    description: "Manage system users, create IDs, and assign roles",
    color: "text-blue-600",
    bgColor: "bg-blue-50 hover:bg-blue-100",
  },
  {
    name: "Payments",
    href: "/dashboard/payments",
    icon: CreditCard,
    description: "Manage rider and merchant withdrawals and payments",
    color: "text-green-600",
    bgColor: "bg-green-50 hover:bg-green-100",
  },
  {
    name: "Offers",
    href: "/dashboard/offers",
    icon: Gift,
    description: "Manage offers, incentives, and banners for all apps",
    color: "text-purple-600",
    bgColor: "bg-purple-50 hover:bg-purple-100",
  },
  {
    name: "Agents",
    href: "/dashboard/agents",
    icon: UserCog,
    description: "Track all agent actions and performance metrics",
    color: "text-orange-600",
    bgColor: "bg-orange-50 hover:bg-orange-100",
  },
];

export default function SuperAdminPage() {
  const pathname = usePathname();
  const { isSuperAdmin, loading, exists } = usePermissions();
  const router = useRouter();
  const redirectAttemptedRef = useRef(false);

  useEffect(() => {
    // Prevent multiple redirect attempts
    if (redirectAttemptedRef.current) {
      return;
    }

    // Wait for loading to complete and data to exist
    if (loading || !exists) {
      return; // Don't do anything while loading or if user doesn't exist yet
    }
    
    // Only redirect if we've confirmed they're not a super admin AND we have data
    if (!isSuperAdmin) {
      redirectAttemptedRef.current = true;
      router.push("/dashboard");
    }
  }, [loading, isSuperAdmin, exists, router]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Super Admin Console</h1>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Super Admin Console</h1>
        <p className="mt-2 text-gray-600">
          Manage users, roles, permissions, access control, and system settings
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {adminOptions.map((option) => {
          const Icon = option.icon;
          const isActive = pathname === option.href;
          
          return (
            <Link
              key={option.name}
              href={option.href}
              className={`rounded-lg border-2 p-6 transition-all duration-200 ${
                isActive
                  ? "border-blue-500 shadow-lg"
                  : "border-gray-200 hover:border-gray-300 hover:shadow-md"
              } ${option.bgColor}`}
            >
              <div className="flex items-start space-x-4">
                <div className={`p-3 rounded-lg bg-white ${option.color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {option.name}
                  </h3>
                  <p className="text-sm text-gray-600">{option.description}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
