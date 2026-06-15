import { FoodDeliverySuccessScreen } from "@/src/components/orders/FoodDeliverySuccessScreen";
import { useLocalSearchParams } from "expo-router";

export default function FoodDeliverySuccessRoute() {
  const params = useLocalSearchParams();
  return <FoodDeliverySuccessScreen params={params} />;
}
