"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";
import type { DashboardType, AccessPointGroup } from "@/lib/db/schema";

interface DashboardAccessSelectorProps {
  selectedDashboards: string[];
  selectedAccessPoints: Record<string, string[]>; // { dashboardType: [accessPointGroups] }
  onDashboardsChange: (dashboards: string[]) => void;
  onAccessPointsChange: (dashboardType: string, accessPoints: string[]) => void;
  disabled?: boolean;
}

// Dashboard definitions with their access points
export const DASHBOARD_DEFINITIONS: Record<
  DashboardType,
  {
    label: string;
    description: string;
    accessPoints: {
      group: AccessPointGroup;
      label: string;
      description: string;
      allowedActions: string[];
    }[];
  }
> = {
  RIDER: {
    label: "Rider Dashboard",
    description: "Single dashboard for all riders. View access shows all data. Action access is service-specific (food, parcel, person_ride).",
    accessPoints: [
      {
        group: "RIDER_VIEW",
        label: "View Rider Details",
        description: "View all rider information, orders, penalties, and details across all services (food, parcel, person_ride)",
        allowedActions: ["VIEW"],
      },
      {
        group: "RIDER_ACTIONS_FOOD",
        label: "Rider Actions (Food)",
        description: "Take actions on riders for food orders: cancel ride, assign, penalty, blacklist/whitelist, wallet, deactivate",
        allowedActions: ["UPDATE", "CANCEL", "BLOCK", "UNBLOCK"],
      },
      {
        group: "RIDER_ACTIONS_PARCEL",
        label: "Rider Actions (Parcel)",
        description: "Take actions on riders for parcel orders: cancel ride, assign, penalty, blacklist/whitelist, wallet, deactivate",
        allowedActions: ["UPDATE", "CANCEL", "BLOCK", "UNBLOCK"],
      },
      {
        group: "RIDER_ACTIONS_PERSON_RIDE",
        label: "Rider Actions (Person Ride)",
        description: "Take actions on riders for person ride orders: cancel ride, assign, penalty, blacklist/whitelist, wallet, deactivate",
        allowedActions: ["UPDATE", "CANCEL", "BLOCK", "UNBLOCK"],
      },
    ],
  },
  MERCHANT: {
    label: "Merchant Dashboard",
    description: "Manage merchants, stores, onboarding, operations, and wallet",
    accessPoints: [
      {
        group: "MERCHANT_VIEW",
        label: "View Merchant Details",
        description: "View merchant information and details",
        allowedActions: ["VIEW"],
      },
      {
        group: "MERCHANT_ONBOARDING",
        label: "Merchant Onboarding",
        description: "Parent/child onboarding status updates",
        allowedActions: ["UPDATE", "APPROVE", "REJECT"],
      },
      {
        group: "MERCHANT_OPERATIONS",
        label: "Merchant Operations",
        description: "Operational status, store status updates",
        allowedActions: ["UPDATE"],
      },
      {
        group: "MERCHANT_STORE_MANAGEMENT",
        label: "Store Management",
        description: "Menu, items, banner, timing, location, documents",
        allowedActions: ["CREATE", "UPDATE", "DELETE"],
      },
      {
        group: "MERCHANT_WALLET",
        label: "Merchant Wallet",
        description: "Wallet amount edit access",
        allowedActions: ["UPDATE"],
      },
    ],
  },
  CUSTOMER: {
    label: "Customer Dashboard",
    description: "Single dashboard for all customers. View access shows all customers. Action access is service-specific (food, parcel, person_ride).",
    accessPoints: [
      {
        group: "CUSTOMER_VIEW",
        label: "View Customer Details",
        description: "View all customer information and details across all services (food, parcel, person_ride)",
        allowedActions: ["VIEW"],
      },
      {
        group: "CUSTOMER_ACTIONS_FOOD",
        label: "Customer Actions (Food)",
        description: "Take actions on food customers: block, suspend, activate",
        allowedActions: ["BLOCK", "UNBLOCK", "UPDATE"],
      },
      {
        group: "CUSTOMER_ACTIONS_PARCEL",
        label: "Customer Actions (Parcel)",
        description: "Take actions on parcel customers: block, suspend, activate",
        allowedActions: ["BLOCK", "UNBLOCK", "UPDATE"],
      },
      {
        group: "CUSTOMER_ACTIONS_PERSON_RIDE",
        label: "Customer Actions (Person Ride)",
        description: "Take actions on person ride customers: block, suspend, activate",
        allowedActions: ["BLOCK", "UNBLOCK", "UPDATE"],
      },
    ],
  },
  ORDER_FOOD: {
    label: "Food Orders Dashboard",
    description: "Manage food delivery orders, cancel orders, assign riders, refunds",
    accessPoints: [
      {
        group: "ORDER_VIEW",
        label: "View Order Details",
        description: "View food order information and details",
        allowedActions: ["VIEW"],
      },
      {
        group: "ORDER_ASSIGN",
        label: "Assign/Deassign Rider",
        description: "Assign or deassign riders to food orders",
        allowedActions: ["ASSIGN", "UPDATE"],
      },
      {
        group: "ORDER_CANCEL",
        label: "Cancel Orders",
        description: "Cancel food orders",
        allowedActions: ["CANCEL", "UPDATE"],
      },
      {
        group: "ORDER_REFUND",
        label: "Process Refunds",
        description: "Process refunds for food orders",
        allowedActions: ["REFUND", "UPDATE"],
      },
    ],
  },
  ORDER_PERSON_RIDE: {
    label: "Person Ride Orders Dashboard",
    description: "Manage person ride orders, cancel rides, assign riders, refunds",
    accessPoints: [
      {
        group: "ORDER_VIEW",
        label: "View Order Details",
        description: "View person ride order information and details",
        allowedActions: ["VIEW"],
      },
      {
        group: "ORDER_ASSIGN",
        label: "Assign/Deassign Rider",
        description: "Assign or deassign riders to person ride orders",
        allowedActions: ["ASSIGN", "UPDATE"],
      },
      {
        group: "ORDER_CANCEL",
        label: "Cancel Orders",
        description: "Cancel person ride orders",
        allowedActions: ["CANCEL", "UPDATE"],
      },
      {
        group: "ORDER_REFUND",
        label: "Process Refunds",
        description: "Process refunds for person ride orders",
        allowedActions: ["REFUND", "UPDATE"],
      },
    ],
  },
  ORDER_PARCEL: {
    label: "Parcel Orders Dashboard",
    description: "Manage parcel delivery orders, cancel orders, assign riders, refunds",
    accessPoints: [
      {
        group: "ORDER_VIEW",
        label: "View Order Details",
        description: "View parcel order information and details",
        allowedActions: ["VIEW"],
      },
      {
        group: "ORDER_ASSIGN",
        label: "Assign/Deassign Rider",
        description: "Assign or deassign riders to parcel orders",
        allowedActions: ["ASSIGN", "UPDATE"],
      },
      {
        group: "ORDER_CANCEL",
        label: "Cancel Orders",
        description: "Cancel parcel orders",
        allowedActions: ["CANCEL", "UPDATE"],
      },
      {
        group: "ORDER_REFUND",
        label: "Process Refunds",
        description: "Process refunds for parcel orders",
        allowedActions: ["REFUND", "UPDATE"],
      },
    ],
  },
  TICKET: {
    label: "Ticket Dashboard",
    description: "Single dashboard for all tickets. Access is service-specific (food, parcel, person_ride). Each service includes order-related, non-order-related, and other tickets from different sources.",
    accessPoints: [
      {
        group: "TICKET_VIEW_FOOD",
        label: "View Food Tickets",
        description: "View tickets for food orders (customer, rider, merchant tickets - order-related and non-order-related)",
        allowedActions: ["VIEW"],
      },
      {
        group: "TICKET_VIEW_PARCEL",
        label: "View Parcel Tickets",
        description: "View tickets for parcel orders (customer pickup, customer drop, rider tickets - order-related and non-order-related)",
        allowedActions: ["VIEW"],
      },
      {
        group: "TICKET_VIEW_PERSON_RIDE",
        label: "View Person Ride Tickets",
        description: "View tickets for person ride orders (customer pickup, customer drop, rider tickets - order-related and non-order-related)",
        allowedActions: ["VIEW"],
      },
      {
        group: "TICKET_ACTIONS_FOOD",
        label: "Food Ticket Actions",
        description: "Perform actions on food tickets: resolve, close, reply, assign",
        allowedActions: ["ASSIGN", "UPDATE", "APPROVE", "REJECT"],
      },
      {
        group: "TICKET_ACTIONS_PARCEL",
        label: "Parcel Ticket Actions",
        description: "Perform actions on parcel tickets: resolve, close, reply, assign",
        allowedActions: ["ASSIGN", "UPDATE", "APPROVE", "REJECT"],
      },
      {
        group: "TICKET_ACTIONS_PERSON_RIDE",
        label: "Person Ride Ticket Actions",
        description: "Perform actions on person ride tickets: resolve, close, reply, assign",
        allowedActions: ["ASSIGN", "UPDATE", "APPROVE", "REJECT"],
      },
    ],
  },
  OFFER: {
    label: "Offer Dashboard",
    description: "Manage offers for rider, customer, and merchant apps",
    accessPoints: [
      {
        group: "OFFER_RIDER",
        label: "Rider App Offers",
        description: "Create and manage rider app offers (incentive, city-wise, condition-wise, surge, bonus, banner)",
        allowedActions: ["CREATE", "UPDATE", "DELETE"],
      },
      {
        group: "OFFER_CUSTOMER",
        label: "Customer App Offers",
        description: "Create and manage customer app offers with banners",
        allowedActions: ["CREATE", "UPDATE", "DELETE"],
      },
      {
        group: "OFFER_MERCHANT",
        label: "Merchant App Offers",
        description: "Create and manage merchant app offers with banners",
        allowedActions: ["CREATE", "UPDATE", "DELETE"],
      },
    ],
  },
  AREA_MANAGER: {
    label: "Area Manager Dashboard",
    description: "Manage area managers for merchants and riders",
    accessPoints: [
      {
        group: "AREA_MANAGER_MERCHANT",
        label: "Merchant Area Manager",
        description: "Create/onboard stores, approve, see details, take actions for merchants",
        allowedActions: ["CREATE", "UPDATE", "APPROVE", "VIEW"],
      },
      {
        group: "AREA_MANAGER_RIDER",
        label: "Rider Area Manager",
        description: "Create/onboard riders, approve, see details, take actions for riders",
        allowedActions: ["CREATE", "UPDATE", "APPROVE", "VIEW"],
      },
    ],
  },
  PAYMENT: {
    label: "Payment Dashboard",
    description: "Manage withdrawal requests (Super Admin Only)",
    accessPoints: [
      {
        group: "PAYMENT_MANAGEMENT",
        label: "Payment Management",
        description: "Approve, update, edit, cancel withdrawal requests (bulk or single)",
        allowedActions: ["VIEW", "UPDATE", "APPROVE", "REJECT", "CANCEL"],
      },
    ],
  },
  SYSTEM: {
    label: "System Dashboard",
    description: "System configuration and settings",
    accessPoints: [],
  },
  ANALYTICS: {
    label: "Analytics Dashboard",
    description: "View analytics and reports",
    accessPoints: [],
  },
};

export function DashboardAccessSelector({
  selectedDashboards,
  selectedAccessPoints,
  onDashboardsChange,
  onAccessPointsChange,
  disabled = false,
}: DashboardAccessSelectorProps) {
  const [expandedDashboards, setExpandedDashboards] = useState<Set<string>>(
    new Set()
  );

  const toggleDashboard = (dashboardType: string) => {
    if (disabled) return;

    if (selectedDashboards.includes(dashboardType)) {
      // Remove dashboard and all its access points
      onDashboardsChange(
        selectedDashboards.filter((d) => d !== dashboardType)
      );
      onAccessPointsChange(dashboardType, []);
    } else {
      // Add dashboard
      onDashboardsChange([...selectedDashboards, dashboardType]);
    }
  };

  const toggleAccessPoint = (dashboardType: string, accessPointGroup: string) => {
    if (disabled) return;

    const currentPoints = selectedAccessPoints[dashboardType] || [];
    if (currentPoints.includes(accessPointGroup)) {
      onAccessPointsChange(
        dashboardType,
        currentPoints.filter((p) => p !== accessPointGroup)
      );
    } else {
      onAccessPointsChange(dashboardType, [...currentPoints, accessPointGroup]);
    }
  };

  const toggleExpand = (dashboardType: string) => {
    const newExpanded = new Set(expandedDashboards);
    if (newExpanded.has(dashboardType)) {
      newExpanded.delete(dashboardType);
    } else {
      newExpanded.add(dashboardType);
    }
    setExpandedDashboards(newExpanded);
  };

  const isDashboardSelected = (dashboardType: string) => {
    return selectedDashboards.includes(dashboardType);
  };

  const isAccessPointSelected = (dashboardType: string, accessPointGroup: string) => {
    return (selectedAccessPoints[dashboardType] || []).includes(accessPointGroup);
  };

  const isExpanded = (dashboardType: string) => {
    return expandedDashboards.has(dashboardType);
  };

  return (
    <div className="space-y-4">
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900 mb-2">
          Dashboard Access & Permissions
        </h3>
        <p className="text-xs text-gray-600 mb-4">
          Select which dashboards this user can access and configure their access points.
        </p>

        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {Object.entries(DASHBOARD_DEFINITIONS).map(([dashboardType, config]) => {
            const selected = isDashboardSelected(dashboardType);
            const expanded = isExpanded(dashboardType);
            const hasAccessPoints = config.accessPoints.length > 0;

            return (
              <div
                key={dashboardType}
                className={`border rounded-lg ${
                  selected ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white"
                }`}
              >
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleDashboard(dashboardType)}
                      disabled={disabled}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selected
                          ? "bg-blue-500 border-blue-500"
                          : "border-gray-300 bg-white"
                      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                    >
                      {selected && <Check className="h-3 w-3 text-white" />}
                    </button>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-gray-900">
                          {config.label}
                        </h4>
                        {dashboardType === "PAYMENT" && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                            Super Admin Only
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {config.description}
                      </p>
                    </div>
                  </div>
                  {hasAccessPoints && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(dashboardType)}
                      className="p-1 hover:bg-gray-100 rounded transition-colors"
                    >
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-gray-600" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-gray-600" />
                      )}
                    </button>
                  )}
                </div>

                {expanded && hasAccessPoints && (
                  <div className="border-t border-gray-200 bg-white p-3 space-y-2">
                    {config.accessPoints.map((accessPoint) => {
                      const pointSelected = isAccessPointSelected(
                        dashboardType,
                        accessPoint.group
                      );

                      return (
                        <div
                          key={accessPoint.group}
                          className={`p-2 rounded border ${
                            pointSelected
                              ? "border-blue-300 bg-blue-50"
                              : "border-gray-200 bg-gray-50"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                toggleAccessPoint(dashboardType, accessPoint.group)
                              }
                              disabled={disabled || !selected}
                              className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                                pointSelected
                                  ? "bg-blue-500 border-blue-500"
                                  : "border-gray-300 bg-white"
                              } ${
                                disabled || !selected
                                  ? "opacity-50 cursor-not-allowed"
                                  : "cursor-pointer"
                              }`}
                            >
                              {pointSelected && (
                                <Check className="h-2.5 w-2.5 text-white" />
                              )}
                            </button>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-gray-900">
                                  {accessPoint.label}
                                </span>
                              </div>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {accessPoint.description}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {accessPoint.allowedActions.map((action) => (
                                  <span
                                    key={action}
                                    className="text-xs px-1.5 py-0.5 bg-gray-200 text-gray-700 rounded"
                                  >
                                    {action}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
