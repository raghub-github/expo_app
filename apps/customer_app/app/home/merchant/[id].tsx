/**
 * Merchant detail - menu list, veg/non-veg, add to cart, quantity.
 */

import { View, Text, ScrollView, TouchableOpacity, Image } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { merchantService } from "@/services/merchant.service";
import { useCartStore } from "@/store/cartStore";

function MenuItemRow({
  id,
  name,
  price,
  isVeg,
  onAdd,
  quantity = 0,
  onIncrement,
  onDecrement,
}: {
  id: string;
  name: string;
  price: number;
  isVeg: boolean;
  onAdd: () => void;
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  return (
    <View className="flex-row items-center py-3 border-b border-gray-100 dark:border-gray-700">
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <View
            className={`w-4 h-4 rounded border-2 ${isVeg ? "border-green-500" : "border-red-500"}`}
          />
          <Text className="text-gray-900 dark:text-white font-medium">{name}</Text>
        </View>
        <Text className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">₹{price}</Text>
      </View>
      {quantity === 0 ? (
        <TouchableOpacity
          onPress={onAdd}
          className="border border-primary-500 px-4 py-2 rounded-lg"
        >
          <Text className="text-primary-500 font-medium">ADD</Text>
        </TouchableOpacity>
      ) : (
        <View className="flex-row items-center bg-primary-500 rounded-lg">
          <TouchableOpacity onPress={onDecrement} className="w-8 h-8 items-center justify-center">
            <Text className="text-white text-lg">−</Text>
          </TouchableOpacity>
          <Text className="text-white font-medium min-w-[24px] text-center">{quantity}</Text>
          <TouchableOpacity onPress={onIncrement} className="w-8 h-8 items-center justify-center">
            <Text className="text-white text-lg">+</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const merchantId = id ?? "";
  const { data: merchant, isLoading } = useQuery({
    queryKey: ["merchant", merchantId],
    queryFn: () => merchantService.getMerchantById(merchantId),
    enabled: !!merchantId,
  });

  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const cartItems = useCartStore((s) => s.items);
  const cartMerchantId = useCartStore((s) => s.merchantId);

  const getQty = (menuItemId: string) =>
    cartMerchantId === merchantId ? cartItems.find((i) => i.menuItemId === menuItemId)?.quantity ?? 0 : 0;

  if (!merchantId || (merchant == null && !isLoading)) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-gray-500">Invalid merchant</Text>
      </View>
    );
  }

  if (isLoading || !merchant) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Text className="text-gray-500">Loading menu...</Text>
      </View>
    );
  }

  const totalInCart = cartItems.reduce((n, i) => n + i.quantity, 0);

  const defaultMerchantImage = require("../../../public/img/ndf.png");

  return (
    <View className="flex-1 bg-gray-50 dark:bg-gray-900">
      <View className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700">
        <View className="w-full h-40 bg-gray-200 dark:bg-gray-700 overflow-hidden">
          {merchant.imageUrl ? (
            <Image source={{ uri: merchant.imageUrl }} className="w-full h-full" resizeMode="cover" />
          ) : (
            <Image source={defaultMerchantImage} className="w-full h-full" resizeMode="cover" />
          )}
        </View>
        <View className="px-4 pt-4 pb-4">
        <TouchableOpacity onPress={() => router.back()} className="self-start mb-2">
          <Text className="text-primary-500">‹ Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900 dark:text-white">{merchant.name}</Text>
        {merchant.cuisines?.length ? (
          <Text className="text-gray-500 dark:text-gray-400 mt-1">{merchant.cuisines.join(", ")}</Text>
        ) : null}
        <View className="flex-row gap-3 mt-2">
          {merchant.rating != null && (
            <Text className="text-primary-600 dark:text-primary-400 font-medium">★ {merchant.rating}</Text>
          )}
          {merchant.deliveryTime && (
            <Text className="text-gray-500 dark:text-gray-400">{merchant.deliveryTime}</Text>
          )}
        </View>
        </View>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingBottom: 100 }}>
        <Text className="text-lg font-semibold text-gray-900 dark:text-white mt-4 mb-2">Menu</Text>
        {merchant.menu?.length
          ? merchant.menu.map((item) => (
              <MenuItemRow
                key={item.id}
                id={item.id}
                name={item.name}
                price={item.price}
                isVeg={item.isVeg}
                quantity={getQty(item.id)}
                onAdd={() => addItem(merchantId, merchant.name, {
                  menuItemId: item.id,
                  name: item.name,
                  price: item.price,
                  isVeg: item.isVeg,
                })}
                onIncrement={() => updateQuantity(item.id, 1)}
                onDecrement={() => updateQuantity(item.id, -1)}
              />
            ))
          : (
            <Text className="text-gray-500 dark:text-gray-400 py-4">No items in menu.</Text>
          )}
      </ScrollView>

      {totalInCart > 0 && (
        <TouchableOpacity
          onPress={() => router.push("/checkout/cart")}
          className="absolute bottom-4 left-4 right-4 bg-primary-500 py-3 rounded-xl items-center"
        >
          <Text className="text-white font-semibold">View cart · {totalInCart} items</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
