"use client";

import React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Users, UtensilsCrossed, Package, Car } from "lucide-react";
import { queryKeys } from "@/lib/queryKeys";
import { fetchUsersByState } from "@/components/customers/CustomerUsersByStateClient";

interface SummaryCardsProps {
  allUsers: number;
  foodUsers: number;
  parcelUsers: number;
  personUsers: number;
  loading?: boolean;
}

const CARD_MIN_HEIGHT = "min-h-[120px]";

export const SummaryCards = React.memo(function SummaryCards({
  allUsers,
  foodUsers,
  parcelUsers,
  personUsers,
  loading = false,
}: SummaryCardsProps) {
  const queryClient = useQueryClient();
  const cards: Array<{
    title: string;
    value: number;
    icon: typeof Users;
    color: string;
    bgColor: string;
    textColor: string;
    href?: string;
    hint?: string;
  }> = [
    {
      title: "All Users",
      value: allUsers,
      icon: Users,
      color: "bg-blue-500",
      bgColor: "bg-blue-50",
      textColor: "text-blue-600",
      href: "/dashboard/customers/users-by-state",
      hint: "View users by state / UT",
    },
    {
      title: "Food Users",
      value: foodUsers,
      icon: UtensilsCrossed,
      color: "bg-orange-500",
      bgColor: "bg-orange-50",
      textColor: "text-orange-600",
    },
    {
      title: "Parcel Users",
      value: parcelUsers,
      icon: Package,
      color: "bg-purple-500",
      bgColor: "bg-purple-50",
      textColor: "text-purple-600",
    },
    {
      title: "Person Users",
      value: personUsers,
      icon: Car,
      color: "bg-green-500",
      bgColor: "bg-green-50",
      textColor: "text-green-600",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const body = (
          <div className="flex items-center justify-between h-full">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-600 mb-1">{card.title}</p>
              <p className="text-3xl font-bold text-gray-900">
                {loading ? (
                  <span className="inline-block w-12 h-8 bg-gray-200 rounded animate-pulse" />
                ) : (
                  card.value.toLocaleString()
                )}
              </p>
              {card.hint ? (
                <p className="mt-1 text-[11px] font-medium text-blue-600/80">{card.hint}</p>
              ) : null}
            </div>
            <div className={`${card.color} p-3 rounded-lg`}>
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
        );

        const className = `${card.bgColor} rounded-lg border border-gray-200 p-6 shadow-sm hover:shadow-md transition-all duration-200 ${CARD_MIN_HEIGHT} ${
          card.href
            ? "cursor-pointer hover:border-blue-300 hover:ring-1 hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            : ""
        }`;

        if (card.href) {
          return (
            <Link
              key={card.title}
              href={card.href}
              className={className}
              aria-label={`${card.title} — ${card.hint ?? "Open details"}`}
              onMouseEnter={() => {
                void queryClient.prefetchQuery({
                  queryKey: queryKeys.customers.usersByState(),
                  queryFn: fetchUsersByState,
                  staleTime: 60_000,
                });
              }}
            >
              {body}
            </Link>
          );
        }

        return (
          <div key={card.title} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
});
