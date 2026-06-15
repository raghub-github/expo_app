import { RideDeliverySuccessScreen } from "@/src/components/orders/RideDeliverySuccessScreen";
import { useLocalSearchParams } from "expo-router";

export default function RideDeliverySuccessRoute() {
  const params = useLocalSearchParams();
  return <RideDeliverySuccessScreen params={params} />;
}
