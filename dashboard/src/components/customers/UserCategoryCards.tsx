"use client";

import React from "react";
import {
  UserPlus,
  UserMinus,
  Repeat,
  CheckCircle,
  XCircle,
  Ban,
  AlertTriangle,
} from "lucide-react";

interface UserCategoryCardsProps {
  newUsers: number;
  oldUsers: number;
  repeatedUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  suspendedUsers: number;
  fraudUsers: number;
  loading?: boolean;
}

const CARD_MIN_HEIGHT = "min-h-[140px]";

export const UserCategoryCards = React.memo(function UserCategoryCards({
  newUsers,
  oldUsers,
  repeatedUsers,
  activeUsers,
  inactiveUsers,
  suspendedUsers,
  fraudUsers,
  loading = false,
}: UserCategoryCardsProps) {
  const categories = [
    {
      title: "New Users",
      description: "Last 30 days",
      value: newUsers,
      icon: UserPlus,
      color: "bg-emerald-500",
      bgColor: "bg-emerald-50",
      textColor: "text-emerald-600",
    },
    {
      title: "Old Users",
      description: "30+ days old",
      value: oldUsers,
      icon: UserMinus,
      color: "bg-gray-500",
      bgColor: "bg-gray-50",
      textColor: "text-gray-600",
    },
    {
      title: "Repeated Users",
      description: "2+ orders",
      value: repeatedUsers,
      icon: Repeat,
      color: "bg-indigo-500",
      bgColor: "bg-indigo-50",
      textColor: "text-indigo-600",
    },
    {
      title: "Active Users",
      description: "Account active",
      value: activeUsers,
      icon: CheckCircle,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
    {
      title: "Inactive Users",
      description: "Account inactive",
      value: inactiveUsers,
      icon: XCircle,
      color: "bg-yellow-500",
      bgColor: "bg-yellow-50",
      textColor: "text-yellow-600",
    },
    {
      title: "Suspended Users",
      description: "Account suspended",
      value: suspendedUsers,
      icon: Ban,
      color: "bg-red-500",
      bgColor: "bg-red-50",
      textColor: "text-red-600",
    },
    {
      title: "Fraud Users",
      description: "High/Critical risk",
      value: fraudUsers,
      icon: AlertTriangle,
      color: "bg-rose-500",
      bgColor: "bg-rose-50",
      textColor: "text-rose-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {categories.map((category) => {
        const Icon = category.icon;
        return (
          <div
            key={category.title}
            className={`${category.bgColor} rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all duration-200 ${CARD_MIN_HEIGHT}`}
          >
            <div className="flex items-start justify-between h-full">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900 mb-1">
                  {category.title}
                </p>
                <p className="text-xs text-gray-600 mb-2">
                  {category.description}
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {loading ? (
                    <span className="inline-block w-10 h-6 bg-gray-200 rounded animate-pulse" />
                  ) : (
                    category.value.toLocaleString()
                  )}
                </p>
              </div>
              <div className={`${category.color} p-2.5 rounded-lg`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
});
