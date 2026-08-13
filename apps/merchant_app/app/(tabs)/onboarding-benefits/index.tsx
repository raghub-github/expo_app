/**
 * Onboarding benefits detail — light theme only.
 * Tasks: Add item images + View packaging tips (no free ads).
 */

import { useCallback, useMemo, useState, Fragment } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StatusBar,
  Platform,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "@/components/AppText";
import {
  GatiMitraMerchant,
  H_PADDING,
  CARD_RADIUS,
  FONT_LORA,
  FONT_LORA_BOLD,
  TAB_BAR_SCROLL_CONTENT_PADDING,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useMenuItems, MENU_CATALOG_LIST_FILTERS } from "@/hooks/useMenuQueries";
import { useMerchantGoBack, useMerchantNavigate } from "@/lib/merchantNavigation";
import {
  dismissOnboardingBenefits,
  ensureOnboardingBenefitsStarted,
  formatOnboardingDeadline,
  isImageUploadComplete,
  isOnboardingExpired,
  loadOnboardingBenefitsState,
  resolveImageUploadTarget,
  reviveOnboardingBenefitsIfPending,
} from "@/lib/onboardingBenefitsStorage";

type TabKey = "activated" | "locked";

function itemHasImage(item: {
  item_image_url?: string | null;
  image_count?: number;
}): boolean {
  return Boolean(item.item_image_url) || (item.image_count ?? 0) > 0;
}

export default function OnboardingBenefitsScreen() {
  const router = useRouter();
  const goBack = useMerchantGoBack();
  const { push: navPush } = useMerchantNavigate();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const { data, isLoading, refetch } = useMenuItems(storeId, token, MENU_CATALOG_LIST_FILTERS);

  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [packagingTipsDone, setPackagingTipsDone] = useState(false);
  const [tab, setTab] = useState<TabKey>("activated");

  const catalogItems = data?.items ?? [];
  const hasCatalogItems = catalogItems.length > 0;
  const itemsWithImages = useMemo(
    () => catalogItems.filter(itemHasImage).length,
    [catalogItems]
  );
  const expired = startedAt ? isOnboardingExpired(startedAt) : false;
  const deadlineLabel = startedAt ? formatOnboardingDeadline(startedAt) : null;
  const showTasks = hasCatalogItems || Boolean(startedAt);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      if (Platform.OS === "android") {
        StatusBar.setBackgroundColor(GatiMitraMerchant.surfaceWarm);
        StatusBar.setBarStyle("dark-content");
        StatusBar.setTranslucent(false);
      }
      void (async () => {
        if (!storeId) return;
        const existing = await loadOnboardingBenefitsState(storeId);
        if (!hasCatalogItems && !existing) return;
        const state = await ensureOnboardingBenefitsStarted(storeId);
        if (cancelled) return;
        await reviveOnboardingBenefitsIfPending(storeId, {
          itemsWithImages,
          approvedItemCount: catalogItems.length,
        });
        const refreshed = await loadOnboardingBenefitsState(storeId);
        setStartedAt((refreshed ?? state).startedAt);
        const tipsDone = Boolean(refreshed?.packagingTipsCompletedAt ?? state.packagingTipsCompletedAt);
        setPackagingTipsDone(tipsDone);
        const expiredNow = isOnboardingExpired((refreshed ?? state).startedAt);
        setTab(expiredNow ? "locked" : "activated");

        const imagesDone = isImageUploadComplete(itemsWithImages, catalogItems.length);
        if (expiredNow || (imagesDone && tipsDone)) {
          await dismissOnboardingBenefits(storeId);
        }
      })();
      void refetch();
      return () => {
        cancelled = true;
      };
    }, [storeId, hasCatalogItems, refetch, itemsWithImages, catalogItems.length])
  );

  const imageTarget = resolveImageUploadTarget(catalogItems.length);
  const imageDone = isImageUploadComplete(itemsWithImages, catalogItems.length);
  const showingLocked = tab === "locked" || expired;
  const activeStep = Math.min(3, 1 + Number(imageDone) + Number(packagingTipsDone));

  return (
    <View style={[styles.screen, { paddingTop: Math.max(insets.top, 10) }]}>
      <ExpoStatusBar style="dark" />
      {Platform.OS === "android" ? (
        <StatusBar backgroundColor={GatiMitraMerchant.surfaceWarm} barStyle="dark-content" />
      ) : null}
      <View style={styles.header}>
        <Pressable
          onPress={() => goBack()}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={22} color={GatiMitraMerchant.textPrimary} />
        </Pressable>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>Onboarding benefits</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {selectedStore?.store_name ?? "Outlet"}
          </Text>
        </View>
      </View>

      <View style={styles.tabRow}>
        <Pressable
          onPress={() => setTab("locked")}
          style={[styles.tab, tab === "locked" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "locked" && styles.tabTextActive]}>Locked</Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("activated")}
          style={[styles.tab, tab === "activated" && styles.tabActive]}
        >
          <Text style={[styles.tabText, tab === "activated" && styles.tabTextActive]}>
            Activated{showTasks ? " 1" : ""}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: TAB_BAR_SCROLL_CONTENT_PADDING + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && !data ? (
          <ActivityIndicator color={GatiMitraMerchant.primary} style={{ marginTop: 40 }} />
        ) : !showTasks ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={36} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyTitle}>No menu items yet</Text>
            <Text style={styles.emptyBody}>
              Add a menu item to start onboarding benefits.
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => navPush("/(tabs)/menu")}
            >
              <Text style={styles.primaryBtnText}>Go to Catalog</Text>
            </Pressable>
          </View>
        ) : tab === "locked" && !expired ? (
          <View style={styles.emptyCard}>
            <Ionicons name="lock-open-outline" size={36} color={GatiMitraMerchant.primary} />
            <Text style={styles.emptyTitle}>Nothing locked yet</Text>
            <Text style={styles.emptyBody}>
              Your benefits are active until {deadlineLabel ?? "the deadline"}. Switch to Activated to continue tasks.
            </Text>
          </View>
        ) : (
          <View style={styles.levelCard}>
            <View style={[styles.levelHeader, showingLocked && styles.levelHeaderLocked]}>
              <View style={styles.deadlinePill}>
                <Ionicons
                  name={expired ? "lock-closed" : "time-outline"}
                  size={14}
                  color={GatiMitraMerchant.textSecondary}
                />
                <Text style={styles.deadlineText}>
                  {expired
                    ? `Expired on ${deadlineLabel}`
                    : `Complete tasks by ${deadlineLabel} to finish onboarding`}
                </Text>
              </View>
              <Text style={styles.levelTitle}>
                {expired ? "Benefit window expired" : "Setup your basics in 10 mins!"}
              </Text>
              <View style={styles.stepper} accessibilityLabel={`Step ${activeStep} of 3`}>
                {[1, 2, 3].map((n, i) => {
                  const reached = n <= activeStep;
                  return (
                    <Fragment key={n}>
                      {i > 0 ? (
                        <View
                          style={[
                            styles.stepLine,
                            n <= activeStep && styles.stepLineActive,
                          ]}
                        />
                      ) : null}
                      <View style={[styles.stepDot, reached ? styles.stepDotActive : styles.stepDotLocked]}>
                        {reached ? (
                          <Text style={styles.stepDotText}>{n}</Text>
                        ) : (
                          <Ionicons name="lock-closed" size={12} color={GatiMitraMerchant.textTertiary} />
                        )}
                      </View>
                    </Fragment>
                  );
                })}
              </View>
            </View>

            <View style={styles.taskList}>
              <TaskRow
                icon="image-outline"
                title={`Add photos on ${imageTarget} items`}
                subtitle={
                  expired && !imageDone
                    ? `Due date ${deadlineLabel} passed. Task locked.`
                    : imageDone
                      ? "Completed"
                      : `${Math.min(itemsWithImages, imageTarget)}/${imageTarget} added`
                }
                done={imageDone}
                locked={expired && !imageDone}
                onPress={() => {
                  if (expired && !imageDone) return;
                  navPush("/(tabs)/menu?view=card&from=onboarding", "/(tabs)/onboarding-benefits");
                }}
              />
              <TaskRow
                icon="cube-outline"
                title="View packaging tips"
                subtitle={
                  packagingTipsDone
                    ? "Completed"
                    : expired
                      ? `Due date ${deadlineLabel} passed. Task locked.`
                      : "Pending"
                }
                done={packagingTipsDone}
                locked={expired && !packagingTipsDone}
                onPress={() => {
                  if (expired && !packagingTipsDone) return;
                  router.push("/(tabs)/onboarding-benefits/packaging-tips");
                }}
              />
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function TaskRow({
  icon,
  title,
  subtitle,
  done,
  locked,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  done: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      style={({ pressed }) => [
        styles.taskRow,
        locked && styles.taskRowLocked,
        pressed && !locked && { backgroundColor: GatiMitraMerchant.surfaceSubtle },
      ]}
    >
      <View style={[styles.taskIcon, done && styles.taskIconDone]}>
        {done ? (
          <Ionicons name="checkmark" size={18} color="#fff" />
        ) : (
          <Ionicons
            name={locked ? "lock-closed" : icon}
            size={18}
            color={locked ? GatiMitraMerchant.textTertiary : GatiMitraMerchant.navy}
          />
        )}
      </View>
      <View style={styles.taskTextCol}>
        <Text style={[styles.taskTitle, locked && styles.taskTitleLocked]}>{title}</Text>
        <Text style={[styles.taskSub, done && styles.taskSubDone, locked && styles.taskTitleLocked]}>
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={locked ? GatiMitraMerchant.border : GatiMitraMerchant.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingBottom: 10,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTextCol: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  headerSub: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: FONT_LORA,
    color: GatiMitraMerchant.textSecondary,
  },
  tabRow: {
    flexDirection: "row",
    marginHorizontal: H_PADDING,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: GatiMitraMerchant.navy,
  },
  tabText: {
    fontSize: 14,
    fontFamily: FONT_LORA,
    color: GatiMitraMerchant.textSecondary,
  },
  tabTextActive: {
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.navy,
  },
  content: {
    paddingHorizontal: H_PADDING,
    paddingTop: 16,
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 16,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    fontFamily: FONT_LORA,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: GatiMitraMerchant.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnText: {
    color: "#fff",
    fontFamily: FONT_LORA_BOLD,
    fontSize: 14,
  },
  levelCard: {
    backgroundColor: "#fff",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
  },
  levelHeader: {
    backgroundColor: "#E8F8F2",
    padding: 16,
  },
  levelHeaderLocked: {
    backgroundColor: "#F1F5F9",
  },
  deadlinePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 12,
    maxWidth: "100%",
  },
  deadlineText: {
    flexShrink: 1,
    fontSize: 12,
    fontFamily: FONT_LORA,
    color: GatiMitraMerchant.textSecondary,
  },
  levelTitle: {
    fontSize: 18,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  stepper: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: GatiMitraMerchant.primary,
  },
  stepDotLocked: {
    backgroundColor: "#E2E8F0",
  },
  stepDotText: {
    fontSize: 12,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.primary,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: "#CBD5E1",
    marginHorizontal: 6,
  },
  stepLineActive: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  taskList: {
    backgroundColor: "#fff",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
  },
  taskRowLocked: {
    opacity: 0.72,
  },
  taskIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  taskIconDone: {
    backgroundColor: GatiMitraMerchant.success,
  },
  taskTextCol: { flex: 1, minWidth: 0 },
  taskTitle: {
    fontSize: 14,
    fontFamily: FONT_LORA_BOLD,
    color: GatiMitraMerchant.textPrimary,
  },
  taskTitleLocked: {
    color: GatiMitraMerchant.textTertiary,
  },
  taskSub: {
    marginTop: 2,
    fontSize: 12,
    fontFamily: FONT_LORA,
    color: GatiMitraMerchant.textSecondary,
  },
  taskSubDone: {
    color: GatiMitraMerchant.success,
  },
});
