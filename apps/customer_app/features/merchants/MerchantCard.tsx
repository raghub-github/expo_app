import { View, Text, TouchableOpacity } from "react-native";

type MerchantCardProps = {
  name: string;
  rating?: number;
  deliveryTime?: string;
  cuisines?: string[];
  costForTwo?: number;
  isOpen?: boolean;
  onPress: () => void;
};

export function MerchantCard({
  name,
  rating,
  deliveryTime,
  cuisines,
  costForTwo,
  isOpen,
  onPress,
}: MerchantCardProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="bg-white dark:bg-gray-800 rounded-2xl p-4 mb-3 border border-gray-100 dark:border-gray-700"
      activeOpacity={0.8}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-900 dark:text-white">{name}</Text>
          {cuisines?.length ? (
            <Text className="text-gray-500 dark:text-gray-400 text-sm mt-0.5" numberOfLines={1}>
              {cuisines.join(", ")}
            </Text>
          ) : null}
          <View className="flex-row items-center mt-2 gap-3">
            {rating != null && (
              <View className="bg-primary-100 dark:bg-primary-900/30 px-2 py-0.5 rounded">
                <Text className="text-primary-600 dark:text-primary-400 text-xs font-medium">
                  ★ {rating}
                </Text>
              </View>
            )}
            {deliveryTime ? (
              <Text className="text-gray-500 dark:text-gray-400 text-xs">{deliveryTime}</Text>
            ) : null}
            {costForTwo != null && (
              <Text className="text-gray-500 dark:text-gray-400 text-xs">₹{costForTwo} for two</Text>
            )}
          </View>
        </View>
        {isOpen === false && (
          <View className="bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
            <Text className="text-red-600 dark:text-red-400 text-xs">Closed</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
