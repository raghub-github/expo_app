import { ActiveRideNavigationScreen } from "@/src/components/orders/ActiveRideNavigationScreen";
import { useLocalSearchParams } from "expo-router";

function resolveRouteOrderId(raw: string | string[] | undefined): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string" && raw[0].trim()) return raw[0].trim();
  return null;
}

export default function ActiveRideRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const orderId = resolveRouteOrderId(id);
  if (!orderId) return null;
  return <ActiveRideNavigationScreen orderId={orderId} />;
}
