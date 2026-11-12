/**
 * Recommended-with-deals rail.
 * Top-K (above-the-fold) images are ALWAYS eager — no ViewportGate / lazy decode.
 * Horizontal FlashList still recycles off-screen columns for memory.
 */
import { useCallback, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import {
  MerchantGridCard,
  MERCHANT_RAIL_CARD_W,
  MERCHANT_RAIL_GAP,
} from "@/components/home/MerchantGridCard";
import type { MerchantSummary } from "@/services/merchant.service";
import { NATURAL_DECELERATION_RATE } from "@/lib/naturalScrollProps";

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
      eager
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
  const { width: screenW } = useWindowDimensions();
  const paired = merchants.length > SINGLE_ROW_MAX;

  const columns = useMemo(() => {
    if (!paired) return merchants.map((m) => [m]);
    const cols: MerchantSummary[][] = [];
    for (let i = 0; i < merchants.length; i += 2) {
      cols.push(merchants.slice(i, i + 2));
    }
    return cols;
  }, [merchants, paired]);

  // One rail column (card + gap). FlashList 2 measures items itself — this only
  // sizes drawDistance so the whole small top-K rail stays mounted.
  const columnWidth = MERCHANT_RAIL_CARD_W + MERCHANT_RAIL_GAP;

  const renderItem = useCallback<ListRenderItem<MerchantSummary[]>>(
    ({ item: pair }) => (
      <DealColumn
        pair={pair}
        weatherDelayMinutes={weatherDelayMinutes}
        onPressMerchant={onPressMerchant}
        onPressInMerchant={onPressInMerchant}
      />
    ),
    [weatherDelayMinutes, onPressMerchant, onPressInMerchant]
  );

  if (merchants.length === 0) return null;

  return (
    <FlashList
      horizontal
      data={columns}
      keyExtractor={(pair) => pair.map((m) => m.id).join("-")}
      renderItem={renderItem}
      // Keep the whole top-K rail hot — small set, must paint instantly.
      drawDistance={Math.max(screenW * 2, columnWidth * columns.length)}
      initialScrollIndex={0}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      decelerationRate={NATURAL_DECELERATION_RATE}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
  },
  cardWrap: {
    width: MERCHANT_RAIL_CARD_W,
    marginRight: MERCHANT_RAIL_GAP,
  },
});
