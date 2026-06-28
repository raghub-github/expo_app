import { ScrollView, StyleSheet, View } from "react-native";
import { MerchantGridCard } from "@/components/home/MerchantGridCard";
import type { MerchantSummary } from "@/services/merchant.service";

type Props = {
  merchants: MerchantSummary[];
  weatherDelayMinutes?: number;
  onPressMerchant: (id: string) => void;
};

export function LovedMerchantsHorizontal({ merchants, weatherDelayMinutes = 0, onPressMerchant }: Props) {
  if (merchants.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      {merchants.map((m) => (
        <View key={`loved-h-${m.id}`} style={styles.cardWrap}>
          <MerchantGridCard
            merchant={m}
            weatherDelayMinutes={weatherDelayMinutes}
            onPress={() => onPressMerchant(m.id)}
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
