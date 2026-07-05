import { ScrollView, StyleSheet, View } from "react-native";
import { MerchantGridCard } from "@/components/home/MerchantGridCard";
import type { MerchantSummary } from "@/services/merchant.service";
import {
  markFoodHomeListScrollActive,
  markFoodHomeListScrollEnded,
} from "@/lib/foodHomeScrollGuard";

type Props = {
  merchants: MerchantSummary[];
  weatherDelayMinutes?: number;
  onPressMerchant: (id: string, merchant?: MerchantSummary) => void;
};

export function LovedMerchantsHorizontal({ merchants, weatherDelayMinutes = 0, onPressMerchant }: Props) {
  if (merchants.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      onScrollBeginDrag={markFoodHomeListScrollActive}
      onScrollEndDrag={markFoodHomeListScrollEnded}
      onMomentumScrollEnd={markFoodHomeListScrollEnded}
    >
      {merchants.map((m) => (
        <View key={`loved-h-${m.id}`} style={styles.cardWrap}>
          <MerchantGridCard
            merchant={m}
            width={132}
            weatherDelayMinutes={weatherDelayMinutes}
            onPress={() => onPressMerchant(m.id, m)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 10,
  },
  cardWrap: {
    width: 132,
  },
});
