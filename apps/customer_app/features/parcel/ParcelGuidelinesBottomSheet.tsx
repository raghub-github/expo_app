/**
 * "Please ensure that" guidelines bottom sheet — slideshow per parcel-capable vehicle category.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { AppAssetImage } from "@/components/AppAssetImage";
import { StoreBottomSheetShell } from "@/components/store/StoreBottomSheetShell";
import { GatiMitraColors } from "@/constants/gatimitra";
import { CX } from "@/lib/appAssetKeys";
import {
  FALLBACK_PARCEL_CATEGORY_CODES,
  buildParcelSlide,
  type ParcelGuidelineItem,
  type ParcelVehicleSlide,
} from "./parcelGuidelinesConfig";
import { fetchParcelGuidelineSlides } from "./parcelVehicleAssignments";
import { resolveRideImage } from "@/features/ride/rideOptionAssets";

const { width: SCREEN_W } = Dimensions.get("window");
const PAGE_H_PAD = 20;
const PAGE_W = SCREEN_W;

type Props = {
  visible: boolean;
  onClose: () => void;
};

function categoryImage(code: string) {
  if (code === "2_wheeler") return resolveRideImage("bike");
  if (code === "3_wheeler") return resolveRideImage("auto");
  return null;
}

function GuidelineCell({ item }: { item: ParcelGuidelineItem }) {
  return (
    <View style={styles.cell}>
      <View style={[styles.iconBox, { backgroundColor: item.iconBg }]}>
        <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={28} color={item.iconColor} />
      </View>
      <AppText style={styles.cellTitle}>{item.title}</AppText>
    </View>
  );
}

function SlidePage({ slide }: { slide: ParcelVehicleSlide }) {
  const img = categoryImage(slide.categoryCode);
  const useVan = slide.categoryCode === "4_wheeler_non_ac";
  return (
    <View style={[styles.page, { width: PAGE_W }]}>
      <View style={styles.vehicleHeader}>
        {useVan ? (
          <AppAssetImage
            assetKey={CX.home.serviceParcel}
            style={styles.vehicleImg}
            contentFit="contain"
          />
        ) : img ? (
          <Image source={img} style={styles.vehicleImg} resizeMode="contain" />
        ) : null}
        <View style={styles.vehicleTextCol}>
          <AppText style={styles.vehicleTitle}>{slide.title}</AppText>
          <AppText style={styles.vehicleSubtitle} numberOfLines={2}>
            {slide.subtitle}
          </AppText>
        </View>
      </View>

      <View style={styles.grid}>
        {slide.guidelines.map((g) => (
          <GuidelineCell key={g.id} item={g} />
        ))}
      </View>
    </View>
  );
}

export function ParcelGuidelinesBottomSheet({ visible, onClose }: Props) {
  const [slides, setSlides] = useState<ParcelVehicleSlide[]>(() =>
    FALLBACK_PARCEL_CATEGORY_CODES.map((c) => buildParcelSlide(c))
  );
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<ParcelVehicleSlide>>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void fetchParcelGuidelineSlides().then((next) => {
      if (cancelled || next.length === 0) return;
      setSlides(next);
      setIndex(0);
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / PAGE_W);
    setIndex(Math.max(0, Math.min(next, slides.length - 1)));
  }, [slides.length]);

  return (
    <StoreBottomSheetShell visible={visible} onClose={onClose} maxHeightRatio={0.72}>
      <View style={styles.handle} />
      <AppText style={styles.title}>Please ensure that</AppText>
      <AppText style={styles.hint}>
        Swipe to see rules for every vehicle that can deliver your parcel
      </AppText>

      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(s) => s.categoryCode}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => <SlidePage slide={item} />}
        style={styles.list}
      />

      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View key={s.categoryCode} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <AppText style={styles.pageLabel}>
        {index + 1} / {slides.length} · {slides[index]?.title ?? "Vehicles"}
      </AppText>
    </StoreBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E3A8A",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  hint: {
    marginTop: 6,
    marginHorizontal: PAGE_H_PAD,
    fontSize: 13,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  list: {
    marginTop: 16,
  },
  page: {
    paddingHorizontal: PAGE_H_PAD,
  },
  vehicleHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  vehicleImg: {
    width: 56,
    height: 56,
  },
  vehicleTextCol: {
    flex: 1,
  },
  vehicleTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraColors.textPrimary,
  },
  vehicleSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    lineHeight: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 18,
  },
  cell: {
    width: "47%",
    alignItems: "center",
  },
  iconBox: {
    width: 72,
    height: 72,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  cellTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1E3A8A",
    textAlign: "center",
    lineHeight: 17,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
  },
  dotActive: {
    backgroundColor: "#2563EB",
    width: 18,
  },
  pageLabel: {
    marginTop: 10,
    marginBottom: 8,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
});
