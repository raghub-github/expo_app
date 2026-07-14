import { ScrollView, StyleSheet, View } from "react-native";
import {
  MerchantGridCard,
  MERCHANT_RAIL_CARD_W,
  MERCHANT_RAIL_GAP,
} from "@/components/home/MerchantGridCard";
import type { MerchantSummary } from "@/services/merchant.service";

type Props = {
  merchants: MerchantSummary[];
  weatherDelayMinutes?: number;
  onPressMerchant: (id: string, merchant?: MerchantSummary) => void;
  onPressInMerchant?: (id: string) => void;
};

export function LovedMerchantsHorizontal({
  merchants,
  weatherDelayMinutes = 0,
  onPressMerchant,
  onPressInMerchant,
}: Props) {
  if (merchants.length === 0) return null;

  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      // First-tap cards must not wait for parent scroll settle.
      delaysContentTouches={false}
      keyboardShouldPersistTaps="handled"
    >
      {merchants.map((m) => (
        <View key={`loved-h-${m.id}`} style={styles.cardWrap}>
          <MerchantGridCard
            merchant={m}
            width={MERCHANT_RAIL_CARD_W}
            weatherDelayMinutes={weatherDelayMinutes}
            onPressIn={onPressInMerchant ? () => onPressInMerchant(m.id) : undefined}
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
    gap: MERCHANT_RAIL_GAP,
  },
  cardWrap: {
    width: MERCHANT_RAIL_CARD_W,
  },
});
