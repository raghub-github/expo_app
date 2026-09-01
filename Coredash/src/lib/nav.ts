import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Gauge,
  BarChart3,
  CreditCard,
  ShoppingCart,
  UserCircle,
  Bike,
  Store,
  Landmark,
  Headphones,
  ReceiptIndianRupee,
} from "lucide-react";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  description: string;
};

export const NAV: NavItem[] = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard, description: "Company snapshot" },
  { name: "Performance", href: "/performance", icon: Gauge, description: "Service KPIs" },
  { name: "Analytics", href: "/analytics", icon: BarChart3, description: "Trends and mix" },
  { name: "Payments", href: "/payments", icon: CreditCard, description: "Collections and payouts" },
  { name: "Orders", href: "/orders", icon: ShoppingCart, description: "Live order book" },
  { name: "Customers", href: "/customers", icon: UserCircle, description: "Demand base" },
  { name: "Riders", href: "/riders", icon: Bike, description: "Fleet health" },
  { name: "Merchants", href: "/merchants", icon: Store, description: "Store network" },
  { name: "Finance", href: "/finance", icon: Landmark, description: "P&L view" },
  { name: "Tax & GST", href: "/tax", icon: ReceiptIndianRupee, description: "GST and filings" },
  { name: "Support", href: "/support", icon: Headphones, description: "Tickets" },
];
