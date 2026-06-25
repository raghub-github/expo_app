import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useRiderVehicle } from "@/src/hooks/useRiderVehicle";
import { useOnboardingVehicleTypes } from "@/src/hooks/useOnboardingVehicleTypes";
import { resolveRiderOnboardingVehicleDisplayName } from "@/src/lib/rider-onboarding-vehicle-display";
import { fuelTypeLabel } from "@/src/lib/rider-vehicle-options";
import { registrationStateLabel } from "@/src/lib/rider-vehicle-form";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];
const TEAL_LIGHT = colors.primary[50];

type IoniconName = ComponentProps<typeof Ionicons>["name"];

function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: IoniconName;
}) {
  return (
    <View style={styles.fieldRow}>
      <View style={styles.fieldIconWrap}>
        <Ionicons name={icon} size={18} color={TEAL} />
      </View>
      <View style={styles.fieldBody}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      <Ionicons name="lock-closed" size={14} color="#CBD5E1" />
    </View>
  );
}

export function ViewVehicleScreen() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = useRiderVehicle();
  const { data: onboardingTypes = [] } = useOnboardingVehicleTypes();
  const vehicle = data?.vehicle;

  const displayVehicleName = useMemo(
    () =>
      resolveRiderOnboardingVehicleDisplayName({
        vehicle,
        onboardingVehicleChoice: data?.onboardingVehicleChoice,
        onboardingPrefill: data?.onboardingPrefill,
        onboardingTypes,
      }),
    [vehicle, data?.onboardingVehicleChoice, data?.onboardingPrefill, onboardingTypes],
  );

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
        >
          <Ionicons name="arrow-back" size={22} color="#0F172A" />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>
            {t("vehicle.page.title", "My vehicle")}
          </Text>
          <Text style={styles.headerSub}>
            {t("vehicle.page.subtitle", "Your registered vehicle details")}
          </Text>
        </View>
      </View>

      {isLoading && !data ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={TEAL} />
          <Text style={styles.centerStateText}>
            {t("vehicle.page.loading", "Loading vehicle…")}
          </Text>
        </View>
      ) : isError || !data ? (
        <View style={styles.centerState}>
          <Ionicons name="cloud-offline-outline" size={40} color="#94A3B8" />
          <Text style={styles.centerStateTitle}>
            {t("vehicle.page.loadFailed", "Could not load vehicle")}
          </Text>
          <Pressable onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>{t("common.retry", "Retry")}</Text>
          </Pressable>
        </View>
      ) : !data.isComplete || !vehicle ? (
        <View style={styles.centerState}>
          <Ionicons name="bicycle-outline" size={48} color="#94A3B8" />
          <Text style={styles.centerStateTitle}>
            {t("vehicle.page.incompleteTitle", "Vehicle details missing")}
          </Text>
          <Text style={styles.centerStateText}>
            {t(
              "vehicle.page.incompleteHint",
              "Go to the home screen to complete your vehicle details.",
            )}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={TEAL} />
          }
        >
          <View style={styles.heroCard}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="bicycle" size={32} color={TEAL} />
            </View>
            <View style={styles.heroBody}>
              <Text style={styles.heroTitle}>{displayVehicleName}</Text>
              <Text style={styles.heroReg}>{vehicle.registrationNumber}</Text>
              {vehicle.verified ? (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#047857" />
                  <Text style={styles.verifiedText}>
                    {t("vehicle.page.verified", "Verified")}
                  </Text>
                </View>
              ) : (
                <View style={styles.pendingBadge}>
                  <Ionicons name="time-outline" size={14} color="#B45309" />
                  <Text style={styles.pendingText}>
                    {t("vehicle.page.pendingVerification", "Verification pending")}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <Text style={styles.sectionLabel}>
            {t("vehicle.page.detailsSection", "Vehicle information")}
          </Text>

          <View style={styles.card}>
            <ReadOnlyField
              label={t("vehicle.page.type", "Vehicle type")}
              value={displayVehicleName}
              icon="bicycle-outline"
            />
            <ReadOnlyField
              label={t("vehicle.page.registration", "Registration number")}
              value={vehicle.registrationNumber}
              icon="card-outline"
            />
            {vehicle.fuelType ? (
              <ReadOnlyField
                label={t("vehicle.page.fuel", "Fuel type")}
                value={vehicle.fuelTypeLabel || fuelTypeLabel(vehicle.fuelType)}
                icon="flash-outline"
              />
            ) : null}
            {vehicle.vehicleType === "other" && vehicle.make?.trim() ? (
              <ReadOnlyField
                label={t("vehicle.page.otherType", "Vehicle type")}
                value={vehicle.make.trim()}
                icon="create-outline"
              />
            ) : vehicle.make?.trim() ? (
              <ReadOnlyField
                label={t("vehicle.page.make", "Make")}
                value={vehicle.make.trim()}
                icon="construct-outline"
              />
            ) : null}
            {vehicle.model?.trim() ? (
              <ReadOnlyField
                label={
                  vehicle.vehicleType === "other"
                    ? t("vehicle.page.makeModel", "Make & model")
                    : t("vehicle.page.model", "Model")
                }
                value={vehicle.model.trim()}
                icon="cube-outline"
              />
            ) : null}
            {vehicle.color?.trim() ? (
              <ReadOnlyField
                label={t("vehicle.page.color", "Color")}
                value={vehicle.color.trim()}
                icon="color-palette-outline"
              />
            ) : null}
            {vehicle.year != null ? (
              <ReadOnlyField
                label={t("vehicle.page.year", "Year")}
                value={String(vehicle.year)}
                icon="calendar-outline"
              />
            ) : null}
            {vehicle.registrationState?.trim() ? (
              <ReadOnlyField
                label={t("vehicle.page.state", "Registration state")}
                value={
                  registrationStateLabel(vehicle.registrationState) ??
                  vehicle.registrationState.trim()
                }
                icon="location-outline"
              />
            ) : null}
            {vehicle.serviceTypes.length > 0 ? (
              <ReadOnlyField
                label={t("vehicle.page.services", "Services")}
                value={vehicle.serviceTypes
                  .map((s) =>
                    s === "food"
                      ? "Food"
                      : s === "parcel"
                        ? "Parcel"
                        : s === "person_ride"
                          ? "Person ride"
                          : s,
                  )
                  .join(", ")}
                icon="layers-outline"
              />
            ) : null}
            <ReadOnlyField
              label={t("vehicle.page.commercial", "Commercial vehicle")}
              value={vehicle.isCommercial ? t("common.yes", "Yes") : t("common.no", "No")}
              icon="business-outline"
            />
            {vehicle.ownershipType?.trim() ? (
              <ReadOnlyField
                label={t("vehicle.page.ownership", "Ownership")}
                value={vehicle.ownershipType.trim().replace(/_/g, " ")}
                icon="document-text-outline"
              />
            ) : null}
            {vehicle.seatingCapacity != null ? (
              <ReadOnlyField
                label={t("vehicle.page.seating", "Seating capacity")}
                value={String(vehicle.seatingCapacity)}
                icon="people-outline"
              />
            ) : null}
            {vehicle.acType?.trim() ? (
              <ReadOnlyField
                label={t("vehicle.page.ac", "AC type")}
                value={vehicle.acType.trim()}
                icon="snow-outline"
              />
            ) : null}
          </View>

          <Text style={styles.footerHint}>
            {t(
              "vehicle.page.readOnlyHint",
              "Vehicle details cannot be changed in the app. Contact support for updates.",
            )}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F4F6F8",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  backBtnPressed: {
    opacity: 0.75,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  headerSub: {
    marginTop: 2,
    fontSize: 13,
    color: "#64748B",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  centerStateText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
  },
  centerStateTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#334155",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 4,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TEAL,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  heroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  heroBody: {
    flex: 1,
    gap: 4,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  heroReg: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
    letterSpacing: 0.5,
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#D1FAE5",
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
  },
  pendingText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B45309",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  fieldIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldBody: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#0F172A",
  },
  footerHint: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 8,
  },
});
