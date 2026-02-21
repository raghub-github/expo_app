/**
 * Order tracking - live status, rider details, map placeholder.
 */

import { View, Text, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import { ORDER_STATUS_LABELS } from "@/constants";

const STATUS_STEPS = [
  "ORDER_PLACED",
  "PREPARING",
  "PICKED_UP",
  "ON_THE_WAY",
  "DELIVERED",
].map((s) => ({ key: s, label: ORDER_STATUS_LABELS[s] ?? s }));

export default function OrderTrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = id ?? "";

  const { data: order, isLoading } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => orderService.getOrder(orderId),
    enabled: !!orderId,
  });

  if (!orderId) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-500">Invalid order</Text>
      </View>
    );
  }

  if (isLoading || !order) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Text className="text-gray-500">Loading order...</Text>
      </View>
    );
  }

  const currentIndex = STATUS_STEPS.findIndex((s) => s.key === order.status);
  const activeIndex = currentIndex >= 0 ? currentIndex : 0;

  return (
    <ScrollView className="flex-1 bg-gray-50 dark:bg-gray-900" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      {/* Map placeholder */}
      <View className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl items-center justify-center mb-6">
        <Text className="text-gray-500 dark:text-gray-400">Map integration ready</Text>
      </View>

      {/* Status timeline */}
      <View className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 mb-4">
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Order status</Text>
        {STATUS_STEPS.map((step, i) => (
          <View key={step.key} className="flex-row items-start mb-3 last:mb-0">
            <View
              className={`w-6 h-6 rounded-full border-2 items-center justify-center ${
                i <= activeIndex ? "border-primary-500 bg-primary-500" : "border-gray-300 dark:border-gray-600"
              }`}
            >
              {i < activeIndex ? (
                <Text className="text-white text-xs">✓</Text>
              ) : i === activeIndex ? (
                <View className="w-2 h-2 rounded-full bg-white" />
              ) : null}
            </View>
            <View className="ml-3 flex-1">
              <Text
                className={
                  i <= activeIndex
                    ? "text-gray-900 dark:text-white font-medium"
                    : "text-gray-400 dark:text-gray-500"
                }
              >
                {step.label}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {/* Rider details placeholder */}
      {order.rider && (
        <View className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700 mb-4">
          <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Rider</Text>
          <Text className="text-gray-700 dark:text-gray-300">{order.rider.name}</Text>
          {order.rider.phone && (
            <Text className="text-primary-500 mt-1">{order.rider.phone}</Text>
          )}
        </View>
      )}

      {/* Order summary */}
      <View className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Order summary</Text>
        {order.items?.map((item, i) => (
          <View key={i} className="flex-row justify-between py-1">
            <Text className="text-gray-700 dark:text-gray-300">
              {item.name} × {item.quantity}
            </Text>
            <Text className="text-gray-900 dark:text-white">₹{item.price * item.quantity}</Text>
          </View>
        ))}
        {order.totalAmount != null && (
          <View className="flex-row justify-between pt-2 mt-2 border-t border-gray-100 dark:border-gray-700">
            <Text className="text-gray-900 dark:text-white font-semibold">Total</Text>
            <Text className="text-gray-900 dark:text-white font-semibold">₹{order.totalAmount}</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
