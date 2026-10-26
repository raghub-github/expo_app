import { ScrollView, StyleSheet, View } from "react-native";
import {
  MerchantGridCard,
  MERCHANT_RAIL_CARD_W,
  MERCHANT_RAIL_GAP,
} from "@/components/home/MerchantGridCard";
import type { MerchantSummary } from "@/services/merchant.service";
import { NATURAL_HORIZONTAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";

type Props = {
  merchants: MerchantSummary[];
  weatherDelayMinutes?: number;
  onPressMerchant: (id: string, merchant?: MerchantSummary) => void;
  onPressInMerchant?: (id: string) => void;
};

/** One row until this many stores. A sixth store opens the second row. */
const SINGLE_ROW_MAX = 5;

function DealCard({
  merchant,
  weatherDelayMinutes,
  onPressMerchant,
  onPressInMerchant,
}: {
  merchant: MerchantSummary;
  weatherDelayMinutes: number;
  onPressMerchant: Props["onPressMerchant"];
  onPressInMerchant?: Props["onPressInMerchant"];
}) {
  return (
    <MerchantGridCard
      merchant={merchant}
      width={MERCHANT_RAIL_CARD_W}
      weatherDelayMinutes={weatherDelayMinutes}
      onPressIn={onPressInMerchant ? () => onPressInMerchant(merchant.id) : undefined}
      onPress={() => onPressMerchant(merchant.id, merchant)}
    />
  );
}

/** Two stores stacked — one column. Never grows past two cards. */
function DealColumn({
  pair,
  weatherDelayMinutes,
  onPressMerchant,
  onPressInMerchant,
}: {
  pair: MerchantSummary[];
  weatherDelayMinutes: number;
  onPressMerchant: Props["onPressMerchant"];
  onPressInMerchant?: Props["onPressInMerchant"];
}) {
  return (
    <View style={styles.cardWrap}>
      {pair.map((merchant) => (
        <DealCard
          key={`loved-h-${merchant.id}`}
          merchant={merchant}
          weatherDelayMinutes={weatherDelayMinutes}
          onPressMerchant={onPressMerchant}
          onPressInMerchant={onPressInMerchant}
        />
      ))}
    </View>
  );
}

export function LovedMerchantsHorizontal({
  merchants,
  weatherDelayMinutes = 0,
  onPressMerchant,
  onPressInMerchant,
}: Props) {
  if (merchants.length === 0) return null;

  const paired = merchants.length > SINGLE_ROW_MAX;
  const columns: MerchantSummary[][] = [];
  if (paired) {
    for (let i = 0; i < merchants.length; i += 2) {
      columns.push(merchants.slice(i, i + 2));
    }
  }

  return (
    <ScrollView
      {...NATURAL_HORIZONTAL_SCROLL_PROPS}
      contentContainerStyle={styles.content}
    >
      <View style={styles.row}>
        {paired
          ? columns.map((pair) => (
              <DealColumn
                key={pair.map((m) => m.id).join("-")}
                pair={pair}
                weatherDelayMinutes={weatherDelayMinutes}
                onPressMerchant={onPressMerchant}
                onPressInMerchant={onPressInMerchant}
              />
            ))
          : merchants.map((merchant) => (
              <View key={`loved-h-${merchant.id}`} style={styles.cardWrap}>
                <DealCard
                  merchant={merchant}
                  weatherDelayMinutes={weatherDelayMinutes}
                  onPressMerchant={onPressMerchant}
                  onPressInMerchant={onPressInMerchant}
                />
              </View>
            ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: MERCHANT_RAIL_GAP,
  },
  cardWrap: {
    width: MERCHANT_RAIL_CARD_W,
  },
});
