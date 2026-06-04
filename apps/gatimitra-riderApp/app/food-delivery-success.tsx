import { View, StyleSheet } from "react-native";
import { FoodDeliverySuccessScreen } from "@/src/components/orders/FoodDeliverySuccessScreen";
import { useLocalSearchParams } from "expo-router";

export default function FoodDeliverySuccessRoute() {
  const params = useLocalSearchParams();
  return (
    <View style={styles.route}>
      <FoodDeliverySuccessScreen params={params} />
    </View>
  );
}

const styles = StyleSheet.create({
  route: { flex: 1 },
});
