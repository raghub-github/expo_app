import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { BlockingBottomSheetShell } from "@/src/components/vehicle/BlockingBottomSheetShell";
import { VehicleDetailsForm } from "@/src/components/vehicle/VehicleDetailsForm";
import { useUpsertRiderVehicle } from "@/src/hooks/useRiderVehicle";
import { extractApiErrorMessage } from "@/src/services/http";
import type { RiderVehicleDto, RiderVehicleFormMeta, RiderVehicleOnboardingPrefill } from "@/src/hooks/useRiderVehicle";
import { isElectronicVehicleForm } from "@/src/lib/rider-vehicle-form-meta";
import { LORA_BOLD, LORA_REGULAR } from "@/src/theme/headerFonts";
import { colors } from "@/src/theme";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { flexShrinkText, rowLayout } from "@/src/theme/responsiveText";

const TEAL = colors.primary[600];

type VehicleDetailsBottomSheetProps = {
  visible: boolean;
  initial?: RiderVehicleDto | null;
  formMeta?: RiderVehicleFormMeta | null;
  onboardingVehicleChoice?: string | null;
  onboardingVehicleCategoryCode?: string | null;
  onboardingPrefill?: RiderVehicleOnboardingPrefill | null;
  onCompleted: () => void;
  onSkip?: () => void;
};

export function VehicleDetailsBottomSheet({
  visible,
  initial,
  formMeta,
  onboardingVehicleChoice,
  onboardingVehicleCategoryCode,
  onboardingPrefill,
  onCompleted,
  onSkip,
}: VehicleDetailsBottomSheetProps) {
  const { t } = useTranslation();
  const upsert = useUpsertRiderVehicle();
  const [apiError, setApiError] = useState<string | null>(null);
  const isCompact = isElectronicVehicleForm(formMeta, initial);
  const { isShortHeight } = useResponsiveLayout();

  return (
    <BlockingBottomSheetShell visible={visible} maxHeightRatio={isShortHeight ? 0.96 : 0.92}>
      <View style={styles.container}>
      <View style={[rowLayout.rowStart, styles.header]}>
        <View style={[styles.iconWrap, rowLayout.noShrink]}>
          <Ionicons name="bicycle" size={26} color={TEAL} />
        </View>
        <View style={[styles.headerText, rowLayout.grow]}>
          <Text style={[styles.title, flexShrinkText]} numberOfLines={2}>
            {isCompact
              ? t("vehicle.sheet.titleCompact", "Complete remaining details")
              : t("vehicle.sheet.title", "Complete vehicle details")}
          </Text>
          <Text style={[styles.subtitle, flexShrinkText]} numberOfLines={isShortHeight ? 3 : 4}>
            {isCompact
              ? t(
                  "vehicle.sheet.subtitleCompact",
                  "Your RC is verified. Confirm services and ownership to go online.",
                )
              : t(
                  "vehicle.sheet.subtitle",
                  "Required before you can go online. You can skip for now.",
                )}
          </Text>
        </View>
      </View>

      <VehicleDetailsForm
        initial={initial}
        formMeta={formMeta}
        onboardingVehicleChoice={onboardingVehicleChoice}
        onboardingVehicleCategoryCode={onboardingVehicleCategoryCode}
        onboardingPrefill={onboardingPrefill}
        onDismissError={() => setApiError(null)}
        submitting={upsert.isPending}
        errorMessage={apiError}
        onSkip={onSkip}
        onSubmit={async (payload) => {
          setApiError(null);
          try {
            const result = await upsert.mutateAsync(payload);
            if (result.isComplete) {
              onCompleted();
            } else {
              const missingServices = !result.vehicle?.serviceTypes?.length;
              setApiError(
                missingServices
                  ? t(
                      "vehicle.form.serviceNotSaved",
                      "Services could not be saved for your vehicle type. Pick a different service or contact support.",
                    )
                  : t("vehicle.form.incomplete", "Please fill all required fields"),
              );
            }
          } catch (e) {
            setApiError(
              extractApiErrorMessage(
                e,
                t("vehicle.form.saveFailed", "Could not save vehicle details"),
              ),
            );
          }
        }}
      />
      </View>
    </BlockingBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: "100%",
    minHeight: 0,
    flexShrink: 1,
  },
  header: {
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    maxWidth: "100%",
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    fontFamily: LORA_BOLD,
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: LORA_REGULAR,
    color: "#64748B",
  },
});
