import { ActiveRideNavigationScreen } from "@/src/components/orders/ActiveRideNavigationScreen";
import { useLocalSearchParams } from "expo-router";

export default function ActiveRideRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (!id || typeof id !== "string") return null;
  return <ActiveRideNavigationScreen orderId={id} />;
}
