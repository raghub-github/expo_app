import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { BlockingBottomSheetShell } from "@/src/components/vehicle/BlockingBottomSheetShell";
import { VehicleDetailsForm } from "@/src/components/vehicle/VehicleDetailsForm";
import { useUpsertRiderVehicle } from "@/src/hooks/useRiderVehicle";
import { extractApiErrorMessage } from "@/src/services/http";
import type { RiderVehicleDto, RiderVehicleFormMeta, RiderVehicleOnboardingPrefill } from "@/src/hooks/useRiderVehicle";
import { colors } from "@/src/theme";

const TEAL = colors.primary[600];

type VehicleDetailsBottomSheetProps = {
  visible: boolean;
  initial?: RiderVehicleDto | null;
  formMeta?: RiderVehicleFormMeta | null;
  onboardingVehicleChoice?: string | null;
  onboardingVehicleCategoryCode?: string | null;
  onboardingPrefill?: RiderVehicleOnboardingPrefill | null;
  onCompleted: () => void;
};

export function VehicleDetailsBottomSheet({
  visible,
  initial,
  formMeta,
  onboardingVehicleChoice,
  onboardingVehicleCategoryCode,
  onboardingPrefill,
  onCompleted,
}: VehicleDetailsBottomSheetProps) {
  const { t } = useTranslation();
  const upsert = useUpsertRiderVehicle();
  const [apiError, setApiError] = useState<string | null>(null);
  const isCompact = formMeta?.formMode === "cashfree_missing_only";

  return (
    <BlockingBottomSheetShell visible={visible}>
      <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="bicycle" size={26} color={TEAL} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {isCompact
              ? t("vehicle.sheet.titleCompact", "Complete remaining details")
              : t("vehicle.sheet.title", "Complete vehicle details")}
          </Text>
          <Text style={styles.subtitle}>
            {isCompact
              ? t(
                  "vehicle.sheet.subtitleCompact",
                  "Your RC is verified. Confirm the details below to go online.",
                )
              : t(
                  "vehicle.sheet.subtitle",
                  "Required before you can go online. This cannot be skipped.",
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
  container: {},
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
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
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
});
