/**
 * Checkout - address selection, payment method, place order.
 */

import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useCartStore } from "@/store/cartStore";
import { orderService } from "@/services/order.service";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const MOCK_ADDRESSES = [
  { id: "addr1", label: "Home", line: "123, Main St, City - 400001" },
  { id: "addr2", label: "Work", line: "456, Park Ave, City - 400002" },
];
const PAYMENT_OPTIONS = [
  { id: "cod", label: "Cash on Delivery" },
  { id: "online", label: "UPI / Card" },
];

export default function CheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { items, merchantId, clearCart } = useCartStore();
  const [selectedAddressId, setSelectedAddressId] = useState(MOCK_ADDRESSES[0]?.id ?? "");
  const [paymentMethod, setPaymentMethod] = useState("cod");

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = 40;
  const total = subtotal + deliveryFee;

  const placeOrder = useMutation({
    mutationFn: () =>
      orderService.createOrder({
        merchantId: merchantId!,
        items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity, price: i.price })),
        addressId: selectedAddressId,
        paymentMethod,
      }),
    onSuccess: (order) => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      router.replace({ pathname: "/orders/[id]", params: { id: order.orderId } });
    },
  });

  if (!merchantId || items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-500">Cart is empty</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4 bg-primary-500 px-6 py-3 rounded-xl">
          <Text className="text-white font-semibold">Back to cart</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="mt-4">
          <Text className="text-gray-700 dark:text-gray-300 font-medium mb-2">Delivery address</Text>
          {MOCK_ADDRESSES.map((addr) => (
            <TouchableOpacity
              key={addr.id}
              onPress={() => setSelectedAddressId(addr.id)}
              className={`p-4 rounded-xl mb-2 border-2 ${
                selectedAddressId === addr.id ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              }`}
            >
              <Text className="text-gray-900 dark:text-white font-medium">{addr.label}</Text>
              <Text className="text-gray-600 dark:text-gray-400 text-sm mt-1">{addr.line}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="mt-6">
          <Text className="text-gray-700 dark:text-gray-300 font-medium mb-2">Payment method</Text>
          {PAYMENT_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              onPress={() => setPaymentMethod(opt.id)}
              className={`p-4 rounded-xl mb-2 border-2 ${
                paymentMethod === opt.id ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              }`}
            >
              <Text className="text-gray-900 dark:text-white">{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="mt-6 bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
          <View className="flex-row justify-between py-1">
            <Text className="text-gray-600 dark:text-gray-400">Subtotal</Text>
            <Text className="text-gray-900 dark:text-white">₹{subtotal}</Text>
          </View>
          <View className="flex-row justify-between py-1">
            <Text className="text-gray-600 dark:text-gray-400">Delivery</Text>
            <Text className="text-gray-900 dark:text-white">₹{deliveryFee}</Text>
          </View>
          <View className="flex-row justify-between py-2 mt-2 border-t border-gray-100 dark:border-gray-700">
            <Text className="text-gray-900 dark:text-white font-semibold">Total</Text>
            <Text className="text-gray-900 dark:text-white font-semibold">₹{total}</Text>
          </View>
        </View>
      </ScrollView>

      <View className="px-4 pb-6 pt-4 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
        <TouchableOpacity
          onPress={() => placeOrder.mutate()}
          disabled={placeOrder.isPending || !selectedAddressId}
          className="bg-primary-500 py-3 rounded-xl items-center"
        >
          {placeOrder.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">Place order · ₹{total}</Text>
          )}
        </TouchableOpacity>
        {placeOrder.isError && (
          <Text className="text-red-500 text-center mt-2">
            {(placeOrder.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to place order"}
          </Text>
        )}
      </View>
    </View>
  );
}
