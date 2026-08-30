import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Keyboard,
  Modal,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  RIDER_FUEL_TYPE_OPTIONS,
  RIDER_SEATING_CAPACITY_OPTIONS,
  RIDER_VEHICLE_TYPE_OPTIONS,
  isTwoOrThreeWheeler,
} from "@/src/lib/rider-vehicle-options";
import {
  AC_TYPE_OPTIONS,
  OWNERSHIP_TYPE_OPTIONS,
  RIDER_SERVICE_TYPE_OPTIONS,
  RIDER_SERVICE_TYPE_VALUES,
  deriveRegistrationStateFromPlate,
  isServiceOptionSelected,
  needsPersonRideFields,
  normalizeRegistrationNumber,
  normalizeSelectedServiceTypes,
  registrationStateLabel,
  toggleServiceSelection,
} from "@/src/lib/rider-vehicle-form";
import type {
  RiderVehicleDto,
  RiderVehicleFormMeta,
  RiderVehicleMissingField,
  RiderVehicleOnboardingPrefill,
  UpsertRiderVehiclePayload,
} from "@/src/hooks/useRiderVehicle";
import { useCategoryServiceAssignments } from "@/src/hooks/useCategoryServiceAssignments";
import { useOnboardingVehicleTypes } from "@/src/hooks/useOnboardingVehicleTypes";
import {
  filterServicesByVehicleAssignments,
  resolveCategoryCodeForVehicleType,
} from "@/src/lib/rider-category-service-assignments";
import { buildVehicleDetailsOnboardingFilter } from "@/src/lib/vehicle-details-onboarding-filter";
import {
  hasMissingStep1VehicleField,
  isElectronicVehicleForm,
} from "@/src/lib/rider-vehicle-form-meta";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { colors } from "@/src/theme";
import { LORA_BOLD, LORA_REGULAR, LORA_SEMIBOLD, POPPINS_SEMIBOLD } from "@/src/theme/headerFonts";

const TEAL = colors.primary[600];
const OTHER_VEHICLE_TYPE = "other";

function initialServiceSelection(serviceTypes: string[] | undefined): string[] {
  const st = serviceTypes ?? [];
  if (
    st.length >= 3 &&
    RIDER_SERVICE_TYPE_VALUES.every((v) => st.includes(v))
  ) {
    return ["all", ...RIDER_SERVICE_TYPE_VALUES];
  }
  return [...st];
}

type VehicleDetailsFormProps = {
  initial?: RiderVehicleDto | null;
  formMeta?: RiderVehicleFormMeta | null;
  onboardingVehicleChoice?: string | null;
  onboardingVehicleCategoryCode?: string | null;
  onboardingPrefill?: RiderVehicleOnboardingPrefill | null;
  onSubmit: (payload: UpsertRiderVehiclePayload) => Promise<void>;
  submitting?: boolean;
  errorMessage?: string | null;
  onDismissError?: () => void;
  onSkip?: () => void;
};

export function VehicleDetailsForm({
  initial,
  formMeta,
  onboardingVehicleChoice,
  onboardingVehicleCategoryCode,
  onboardingPrefill,
  onSubmit,
  submitting = false,
  errorMessage,
  onDismissError,
  onSkip,
}: VehicleDetailsFormProps) {
  const { t } = useTranslation();
  const { height: winH } = useWindowDimensions();
  const systemBottom = useRiderBottomInset();
  const assignmentsQuery = useCategoryServiceAssignments();
  const onboardingTypesQuery = useOnboardingVehicleTypes();
  const storeVehicleChoice = useOnboardingStore((s) => s.data.vehicleChoice);
  const storeVehicleCategoryCode = useOnboardingStore((s) => s.data.vehicleCategoryCode);
  const storeRcNumber = useOnboardingStore((s) => s.data.rcNumber);
  const hydrateOnboarding = useOnboardingStore((s) => s.hydrate);
  const isCompact = isElectronicVehicleForm(formMeta, initial);
  const missingFields = formMeta?.missingFields ?? [];
  const missingSet = useMemo(() => new Set(missingFields), [missingFields]);
  const [step, setStep] = useState<1 | 2>(() =>
    isCompact ? 2 : (formMeta?.initialStep ?? 1),
  );

  const [vehicleType, setVehicleType] = useState(initial?.vehicleType ?? "bike");
  const [customOtherType, setCustomOtherType] = useState(
    initial?.vehicleType === OTHER_VEHICLE_TYPE ? (initial?.make ?? "") : "",
  );
  const [registrationNumber, setRegistrationNumber] = useState(
    initial?.registrationNumber ?? "",
  );
  const [fuelType, setFuelType] = useState<string | null>(initial?.fuelType ?? null);
  const [make, setMake] = useState(
    initial?.vehicleType === OTHER_VEHICLE_TYPE ? "" : (initial?.make ?? ""),
  );
  const [model, setModel] = useState(initial?.model ?? "");
  const [color, setColor] = useState(initial?.color ?? "");
  const [year, setYear] = useState(initial?.year != null ? String(initial.year) : "");

  const [selectedServices, setSelectedServices] = useState<string[]>(() =>
    initialServiceSelection(initial?.serviceTypes),
  );
  const [servicePickerOpen, setServicePickerOpen] = useState(false);
  const [seatingPickerOpen, setSeatingPickerOpen] = useState(false);
  const [isCommercial, setIsCommercial] = useState(initial?.isCommercial ?? false);
  const [ownershipType, setOwnershipType] = useState<string | null>(
    initial?.ownershipType ?? null,
  );
  const [seatingCapacity, setSeatingCapacity] = useState(
    initial?.seatingCapacity != null ? String(initial.seatingCapacity) : "",
  );
  const [acType, setAcType] = useState<string | null>(initial?.acType ?? null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const regFieldY = useRef(0);
  const otherInputRef = useRef<TextInput>(null);
  const otherFieldY = useRef(0);
  const isOtherType = vehicleType === OTHER_VEHICLE_TYPE;

  useEffect(() => {
    void hydrateOnboarding();
  }, [hydrateOnboarding]);

  useEffect(() => {
    setStep(isCompact ? 2 : (formMeta?.initialStep ?? 1));
  }, [isCompact, formMeta?.initialStep, initial?.id]);

  const showStep1Field = (field: RiderVehicleMissingField | "vehicle_type" | "make_model") => {
    if (!isCompact) return true;
    if (field === "make_model") {
      return missingSet.has("make") || missingSet.has("model");
    }
    return missingSet.has(field);
  };

  const showStep2Field = (field: RiderVehicleMissingField) => {
    if (
      field === "service_types" ||
      field === "ownership_type" ||
      field === "is_commercial"
    ) {
      return true;
    }
    if (!isCompact) return true;
    return missingSet.has(field);
  };

  const showStep1Section = useMemo(() => {
    if (!isCompact) return step === 1;
    return hasMissingStep1VehicleField(missingSet);
  }, [isCompact, step, missingSet]);

  const compactSingleStep = isCompact;
  const showBackButton = !isCompact;

  const verifiedSummaryLines = useMemo(() => {
    if (!isCompact || !initial) return [];
    const lines: string[] = [];
    if (initial.registrationNumber) {
      lines.push(
        `${t("vehicle.form.registration", "Registration number")}: ${initial.registrationNumber}`,
      );
    }
    if (initial.vehicleTypeLabel) {
      lines.push(`${t("vehicle.form.typeLabel", "Vehicle type")}: ${initial.vehicleTypeLabel}`);
    }
    const makeModel = [initial.make, initial.model].filter(Boolean).join(" ");
    if (makeModel) {
      lines.push(`${t("vehicle.form.makeModel", "Make & model")}: ${makeModel}`);
    }
    if (initial.fuelTypeLabel) {
      lines.push(`${t("vehicle.form.fuelType", "Fuel type")}: ${initial.fuelTypeLabel}`);
    }
    if (initial.color) {
      lines.push(`${t("vehicle.form.color", "Color")}: ${initial.color}`);
    }
    if (initial.year != null) {
      lines.push(`${t("vehicle.form.year", "Year")}: ${initial.year}`);
    }
    return lines;
  }, [isCompact, initial, t]);

  const effectiveVehicleChoice =
    onboardingVehicleChoice?.trim() ||
    storeVehicleChoice?.trim() ||
    null;
  const effectiveVehicleCategoryCode =
    onboardingVehicleCategoryCode?.trim() ||
    storeVehicleCategoryCode?.trim() ||
    null;

  const onboardingFilter = useMemo(
    () =>
      buildVehicleDetailsOnboardingFilter({
        vehicleChoice: effectiveVehicleChoice,
        vehicleCategoryCode: effectiveVehicleCategoryCode,
        onboardingTypes: onboardingTypesQuery.data ?? [],
        existingVehicleType: initial?.vehicleType ?? null,
      }),
    [
      effectiveVehicleChoice,
      effectiveVehicleCategoryCode,
      onboardingTypesQuery.data,
      initial?.vehicleType,
    ]
  );

  const vehicleTypeOptions = onboardingFilter?.vehicleTypeOptions ?? RIDER_VEHICLE_TYPE_OPTIONS;
  const lockVehicleType = onboardingFilter?.lockVehicleType ?? false;
  const fuelTypeOptions = onboardingFilter?.fuelTypeOptions ?? RIDER_FUEL_TYPE_OPTIONS;
  const hideFuelType = onboardingFilter?.hideFuelType ?? false;

  useEffect(() => {
    if (!onboardingFilter || initial?.vehicleType) return;
    setVehicleType(onboardingFilter.resolvedVehicleType);
    if (
      onboardingFilter.resolvedVehicleType === OTHER_VEHICLE_TYPE &&
      onboardingFilter.customTypeLabel
    ) {
      setCustomOtherType(onboardingFilter.customTypeLabel);
    }
    if (onboardingFilter.defaultFuelType) {
      setFuelType(onboardingFilter.defaultFuelType);
    }
  }, [onboardingFilter, initial?.vehicleType]);

  useEffect(() => {
    const prefillReg =
      onboardingPrefill?.registrationNumber?.trim() ||
      storeRcNumber?.trim() ||
      "";
    if (prefillReg && !registrationNumber.trim()) {
      setRegistrationNumber(prefillReg);
    }
  }, [onboardingPrefill?.registrationNumber, storeRcNumber, registrationNumber]);

  useEffect(() => {
    if (initial?.acType || !onboardingPrefill?.suggestedAcType) return;
    setAcType(onboardingPrefill.suggestedAcType);
  }, [initial?.acType, onboardingPrefill?.suggestedAcType]);

  useEffect(() => {
    if (initial?.isCommercial != null || onboardingPrefill?.suggestedIsCommercial == null) {
      return;
    }
    setIsCommercial(onboardingPrefill.suggestedIsCommercial);
  }, [initial?.isCommercial, onboardingPrefill?.suggestedIsCommercial]);

  const normalizedServices = useMemo(
    () => normalizeSelectedServiceTypes(selectedServices),
    [selectedServices],
  );
  const showPersonRideFields = needsPersonRideFields(normalizedServices);
  const acTypeDisabled = isTwoOrThreeWheeler(vehicleType);

  useEffect(() => {
    if (acTypeDisabled && acType) setAcType(null);
  }, [acTypeDisabled, acType]);

  const showStep2Section = useMemo(() => {
    if (isCompact) return true;
    return step === 2;
  }, [isCompact, step]);

  const derivedState = useMemo(
    () => deriveRegistrationStateFromPlate(registrationNumber),
    [registrationNumber],
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!initial) return;
    setVehicleType(initial.vehicleType);
    const isOther = initial.vehicleType === OTHER_VEHICLE_TYPE;
    setCustomOtherType(isOther ? (initial.make ?? "") : "");
    setRegistrationNumber(initial.registrationNumber);
    setFuelType(initial.fuelType);
    setMake(isOther ? "" : (initial.make ?? ""));
    setModel(initial.model ?? "");
    setColor(initial.color ?? "");
    setYear(initial.year != null ? String(initial.year) : "");
    setSelectedServices(initialServiceSelection(initial.serviceTypes));
    setIsCommercial(initial.isCommercial);
    setOwnershipType(initial.ownershipType);
    setSeatingCapacity(
      initial.seatingCapacity != null ? String(initial.seatingCapacity) : "",
    );
    setAcType(initial.acType);
  }, [initial?.id]);

  useEffect(() => {
    if (!isOtherType || step !== 1) return;
    const timer = setTimeout(() => {
      otherInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, [isOtherType, step]);

  const canContinueStep1 = useMemo(() => {
    const regOk = registrationNumber.trim().length >= 4;
    const typeOk = vehicleType.trim().length > 0;
    const otherOk =
      vehicleType !== OTHER_VEHICLE_TYPE || customOtherType.trim().length >= 2;
    return typeOk && regOk && otherOk;
  }, [vehicleType, registrationNumber, customOtherType]);

  const vehicleCategoryCode = useMemo(
    () =>
      resolveCategoryCodeForVehicleType(
        vehicleType,
        onboardingTypesQuery.data ?? [],
        initial?.vehicleCategory ?? effectiveVehicleCategoryCode ?? null
      ),
    [vehicleType, onboardingTypesQuery.data, initial?.vehicleCategory, effectiveVehicleCategoryCode]
  );

  const allowedServiceOptions = useMemo(() => {
    const assigned = filterServicesByVehicleAssignments(
      [...RIDER_SERVICE_TYPE_VALUES],
      vehicleType,
      assignmentsQuery.data?.byMapsToVehicleType,
      vehicleCategoryCode,
      assignmentsQuery.data?.byCategory ?? {}
    );
    const allowedSet = new Set(assigned);
    return RIDER_SERVICE_TYPE_OPTIONS.filter(
      (o) => o.value === "all" || allowedSet.has(o.value as (typeof RIDER_SERVICE_TYPE_VALUES)[number])
    );
  }, [
    vehicleType,
    vehicleCategoryCode,
    assignmentsQuery.data?.byCategory,
    assignmentsQuery.data?.byMapsToVehicleType,
  ]);

  useEffect(() => {
    const assigned = filterServicesByVehicleAssignments(
      normalizeSelectedServiceTypes(selectedServices),
      vehicleType,
      assignmentsQuery.data?.byMapsToVehicleType,
      vehicleCategoryCode,
      assignmentsQuery.data?.byCategory ?? {}
    );
    if (assigned.length === 0) return;
    setSelectedServices((prev) => {
      const current = normalizeSelectedServiceTypes(prev);
      if (current.sort().join(",") === [...assigned].sort().join(",")) return prev;
      return assigned.length === RIDER_SERVICE_TYPE_VALUES.length
        ? ["all", ...RIDER_SERVICE_TYPE_VALUES]
        : assigned;
    });
  }, [
    vehicleType,
    vehicleCategoryCode,
    assignmentsQuery.data?.byCategory,
    assignmentsQuery.data?.byMapsToVehicleType,
  ]);

  const canSubmitStep2 = useMemo(() => {
    if (normalizedServices.length < 1) return false;
    if (!ownershipType) return false;
    return true;
  }, [normalizedServices, ownershipType]);

  const serviceSummary = useMemo(() => {
    if (normalizedServices.length === 0) {
      return t("vehicle.form.serviceTypesPh", "Select services you will deliver");
    }
    if (normalizedServices.length === RIDER_SERVICE_TYPE_VALUES.length) {
      return t("vehicle.form.serviceAll", "All services");
    }
    return allowedServiceOptions.filter(
      (o) => o.value !== "all" && normalizedServices.includes(o.value),
    )
      .map((o) => o.label)
      .join(", ");
  }, [normalizedServices, allowedServiceOptions, t]);

  const validateStep1 = (): boolean => {
    const reg = registrationNumber.trim();
    if (reg.length < 4) {
      setLocalError(t("vehicle.form.regRequired", "Enter a valid registration number"));
      return false;
    }
    if (vehicleType === OTHER_VEHICLE_TYPE && customOtherType.trim().length < 2) {
      setLocalError(
        t("vehicle.form.otherTypeRequired", "Please specify your vehicle type"),
      );
      return false;
    }
    return true;
  };

  const resolveFuelTypeForSubmit = (): string | null => {
    const normalized = fuelType?.trim().toLowerCase() || null;
    if (normalized) return normalized;
    if (hideFuelType) {
      return onboardingFilter?.defaultFuelType ?? null;
    }
    return (
      onboardingFilter?.defaultFuelType ??
      fuelTypeOptions.find((opt) => opt.value === "petrol")?.value ??
      fuelTypeOptions[0]?.value ??
      null
    );
  };

  const applyFuelDefaults = () => {
    if (fuelType?.trim()) return;
    const next = resolveFuelTypeForSubmit();
    if (next) setFuelType(next);
  };

  const handleContinue = () => {
    setLocalError(null);
    onDismissError?.();
    if (!validateStep1()) return;
    applyFuelDefaults();
    setStep(2);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  };

  const handleSave = async () => {
    setLocalError(null);
    if (!validateStep1()) {
      if (!isCompact) setStep(1);
      return;
    }
    if (normalizedServices.length < 1) {
      setLocalError(
        t("vehicle.form.serviceRequired", "Select at least one service type"),
      );
      return;
    }
    if (!ownershipType) {
      setLocalError(
        t("vehicle.form.ownershipRequired", "Select ownership type"),
      );
      return;
    }

    applyFuelDefaults();

    const resolvedFuelType = resolveFuelTypeForSubmit();
    if (!hideFuelType && fuelTypeOptions.length > 0 && !resolvedFuelType) {
      setLocalError(t("vehicle.form.fuelRequired", "Select fuel type"));
      if (!isCompact) setStep(1);
      return;
    }

    const reg = normalizeRegistrationNumber(registrationNumber);
    const parsedYear = year.trim() ? Number(year.trim()) : null;
    const brandMake = make.trim();
    const brandModel = model.trim();
    const combinedBrand =
      [brandMake, brandModel].filter(Boolean).join(" ") || null;

    const parsedSeating = seatingCapacity.trim()
      ? Number(seatingCapacity.trim())
      : null;

    await onSubmit({
      vehicleType,
      registrationNumber: reg,
      fuelType: resolvedFuelType,
      make:
        vehicleType === OTHER_VEHICLE_TYPE
          ? customOtherType.trim()
          : brandMake || null,
      model:
        vehicleType === OTHER_VEHICLE_TYPE ? combinedBrand : brandModel || null,
      color: color.trim() || null,
      year: parsedYear,
      registrationState: deriveRegistrationStateFromPlate(reg),
      ownershipType,
      serviceTypes: normalizedServices,
      isCommercial,
      seatingCapacity: showPersonRideFields ? parsedSeating : null,
      acType: showPersonRideFields && !acTypeDisabled ? acType : null,
      vehicleCategoryCode: vehicleCategoryCode ?? effectiveVehicleCategoryCode ?? null,
      onboardingVehicleChoice: effectiveVehicleChoice,
    });
  };

  const displayError = errorMessage ?? localError;

  const fieldsMaxHeight = Math.max(
    160,
    Math.round(winH * 0.92) -
      systemBottom -
      (keyboardHeight > 0 ? Math.min(keyboardHeight, Math.round(winH * 0.35)) : 0) -
      250,
  );

  const plainTextProps = {
    autoCorrect: false,
    autoComplete: "off" as const,
    spellCheck: false,
    textContentType: "none" as const,
    secureTextEntry: false,
    ...(Platform.OS === "android" ? { importantForAutofill: "no" as const } : {}),
  };

  const scrollToRegistration = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, regFieldY.current - 12),
        animated: true,
      });
    });
  };

  const focusOtherTypeInput = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, otherFieldY.current - 12),
        animated: true,
      });
      otherInputRef.current?.focus();
    });
  };

  return (
    <>
      <View style={styles.stepHeader}>
        <Text style={styles.stepLabel}>
          {compactSingleStep
            ? showStep1Section
              ? t("vehicle.form.remainingStep", "Complete remaining details")
              : t("vehicle.form.step2Only", "Service & ownership")
            : step === 1
              ? t("vehicle.form.step1", "Step 1 of 2 — Vehicle details")
              : t("vehicle.form.step2", "Step 2 of 2 — Service & ownership")}
        </Text>
        {!compactSingleStep ? (
          <View style={styles.stepDots}>
            <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
            <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
          </View>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        nestedScrollEnabled
        style={{ maxHeight: fieldsMaxHeight }}
        contentContainerStyle={[styles.scroll, styles.scrollContent]}
      >
        {compactSingleStep && verifiedSummaryLines.length > 0 ? (
          <View style={styles.verifiedSummary}>
            <View style={styles.verifiedSummaryHeader}>
              <Ionicons name="shield-checkmark" size={16} color={TEAL} />
              <Text style={styles.verifiedSummaryTitle}>
                {t("vehicle.form.rcVerifiedSummary", "RC verified from Cashfree")}
              </Text>
            </View>
            {verifiedSummaryLines.map((line) => (
              <Text key={line} style={styles.verifiedSummaryLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}

        {showStep1Section ? (
          <>
            {showStep1Field("vehicle_type") ? (
              <>
            <Text style={styles.sectionLabel}>
              {t("vehicle.form.typeLabel", "Vehicle type")}
              <Text style={styles.required}> *</Text>
            </Text>
            {lockVehicleType ? (
              <View style={styles.lockedTypeRow}>
                <View style={[styles.typeChip, styles.typeChipSelected, styles.typeChipLocked]}>
                  <Ionicons
                    name={
                      vehicleTypeOptions[0]?.icon ??
                      RIDER_VEHICLE_TYPE_OPTIONS.find((o) => o.value === vehicleType)?.icon ??
                      "bicycle-outline"
                    }
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={[styles.typeChipText, styles.typeChipTextSelected]}>
                    {onboardingFilter?.onboardingDisplayLabel ??
                      vehicleTypeOptions[0]?.label ??
                      vehicleType}
                  </Text>
                </View>
                <Text style={styles.hintText}>
                  {t(
                    "vehicle.form.typeFromOnboarding",
                    "Selected during onboarding — cannot be changed here.",
                  )}
                </Text>
              </View>
            ) : (
              <View style={styles.chipGrid}>
                {vehicleTypeOptions.map((opt) => {
                  const selected = vehicleType === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => {
                        setVehicleType(opt.value);
                        if (opt.value === OTHER_VEHICLE_TYPE) {
                          focusOtherTypeInput();
                        }
                      }}
                      style={[styles.typeChip, selected && styles.typeChipSelected]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={16}
                        color={selected ? "#FFFFFF" : TEAL}
                      />
                      <Text
                        style={[styles.typeChipText, selected && styles.typeChipTextSelected]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {isOtherType && !lockVehicleType ? (
              <View
                onLayout={(e) => {
                  otherFieldY.current = e.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.fieldLabel}>
                  {t("vehicle.form.otherTypeLabel", "Specify vehicle type")}
                  <Text style={styles.required}> *</Text>
                </Text>
                <View style={styles.inputWrap}>
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color="#94A3B8"
                    style={styles.inputIcon}
                  />
                  <TextInput
                    ref={otherInputRef}
                    value={customOtherType}
                    onChangeText={setCustomOtherType}
                    placeholder={t("vehicle.form.otherTypePh", "e.g. Loader, Pickup van")}
                    style={styles.textInput}
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="words"
                    returnKeyType="next"
                    {...plainTextProps}
                  />
                </View>
              </View>
            ) : null}

            {isOtherType && lockVehicleType && customOtherType.trim() ? (
              <Text style={styles.hintText}>
                {t("vehicle.form.otherTypeLocked", "Type")}: {customOtherType.trim()}
              </Text>
            ) : null}
              </>
            ) : null}

            {showStep1Field("registration_number") ? (
            <View
              onLayout={(e) => {
                regFieldY.current = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.fieldLabel}>
                {t("vehicle.form.registration", "Registration number")}
                <Text style={styles.required}> *</Text>
              </Text>
              <View style={styles.inputWrap}>
                <Ionicons
                  name="card-outline"
                  size={18}
                  color="#94A3B8"
                  style={styles.inputIcon}
                />
                <TextInput
                  value={registrationNumber}
                  onChangeText={setRegistrationNumber}
                  placeholder={t("vehicle.form.registrationPh", "e.g. DL01AB1234")}
                  style={styles.textInput}
                  placeholderTextColor="#94A3B8"
                  keyboardType={
                    Platform.OS === "android" ? "visible-password" : "default"
                  }
                  autoCapitalize="characters"
                  onFocus={scrollToRegistration}
                  {...plainTextProps}
                />
              </View>
              {derivedState ? (
                <Text style={styles.hintText}>
                  {t("vehicle.form.stateDetected", "State")}:{" "}
                  {registrationStateLabel(derivedState) ?? derivedState} ({derivedState})
                </Text>
              ) : null}
            </View>
            ) : null}

            {showStep1Field("fuel_type") && !hideFuelType ? (
              <>
                <Text style={styles.fieldLabel}>{t("vehicle.form.fuelType", "Fuel type")}</Text>
                <View style={styles.chipRow}>
                  {fuelTypeOptions.map((opt) => {
                    const selected = fuelType === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setFuelType(selected ? null : opt.value)}
                        style={[styles.fuelChip, selected && styles.fuelChipSelected]}
                      >
                        <Text
                          style={[styles.fuelChipText, selected && styles.fuelChipTextSelected]}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {showStep1Field("make_model") ? (
            <>
            <Text style={styles.fieldLabel}>
              {t("vehicle.form.makeModel", "Make & model")}
            </Text>
            <View style={styles.row}>
              <View style={[styles.inputWrap, styles.half]}>
                <TextInput
                  value={make}
                  onChangeText={setMake}
                  placeholder={t("vehicle.form.makePh", "e.g. Honda, Hero")}
                  style={styles.textInput}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                  {...plainTextProps}
                />
              </View>
              <View style={[styles.inputWrap, styles.half]}>
                <TextInput
                  value={model}
                  onChangeText={setModel}
                  placeholder={t("vehicle.form.modelPh", "e.g. Activa, Splendor")}
                  style={styles.textInput}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="words"
                  {...plainTextProps}
                />
              </View>
            </View>
            </>
            ) : null}

            {!isCompact || showStep1Field("color") || showStep1Field("year") ? (
            <View style={styles.row}>
              <View style={[styles.fieldGroup, styles.half]}>
                <Text style={styles.fieldLabel}>{t("vehicle.form.color", "Color")}</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={color}
                    onChangeText={setColor}
                    placeholder={t("vehicle.form.colorPh", "e.g. Black, White")}
                    style={styles.textInput}
                    placeholderTextColor="#94A3B8"
                    autoCapitalize="words"
                    {...plainTextProps}
                  />
                </View>
              </View>
              <View style={[styles.fieldGroup, styles.half]}>
                <Text style={styles.fieldLabel}>{t("vehicle.form.year", "Year")}</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    value={year}
                    onChangeText={setYear}
                    placeholder={t("vehicle.form.yearPh", "e.g. 2022")}
                    keyboardType="number-pad"
                    maxLength={4}
                    style={styles.textInput}
                    placeholderTextColor="#94A3B8"
                    autoComplete="off"
                    textContentType="none"
                  />
                </View>
              </View>
            </View>
            ) : null}
          </>
        ) : null}

        {showStep2Section ? (
          <>
            {showStep2Field("service_types") ? (
              <>
            <Text style={styles.fieldLabel}>
              {t("vehicle.form.serviceTypes", "Services you will deliver")}
              <Text style={styles.required}> *</Text>
            </Text>
            <Pressable
              onPress={() => setServicePickerOpen(true)}
              style={styles.dropdownTrigger}
            >
              <Ionicons name="layers-outline" size={18} color="#94A3B8" />
              <Text
                style={[
                  styles.dropdownText,
                  normalizedServices.length === 0 && styles.dropdownPlaceholder,
                ]}
                numberOfLines={2}
              >
                {serviceSummary}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#64748B" />
            </Pressable>
              </>
            ) : null}

            {showStep2Field("is_commercial") ? (
              <>
            <Text style={styles.fieldLabel}>
              {t("vehicle.form.isCommercial", "Commercial vehicle?")}
              <Text style={styles.required}> *</Text>
            </Text>
            <View style={styles.chipRow}>
              <Pressable
                onPress={() => setIsCommercial(false)}
                style={[styles.fuelChip, !isCommercial && styles.fuelChipSelected]}
              >
                <Text
                  style={[styles.fuelChipText, !isCommercial && styles.fuelChipTextSelected]}
                >
                  {t("common.no", "No")}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setIsCommercial(true)}
                style={[styles.fuelChip, isCommercial && styles.fuelChipSelected]}
              >
                <Text
                  style={[styles.fuelChipText, isCommercial && styles.fuelChipTextSelected]}
                >
                  {t("common.yes", "Yes")}
                </Text>
              </Pressable>
            </View>
              </>
            ) : null}

            {showStep2Field("ownership_type") ? (
              <>
            <Text style={styles.fieldLabel}>
              {t("vehicle.form.ownership", "Ownership")}
              <Text style={styles.required}> *</Text>
            </Text>
            <View style={styles.chipRow}>
              {OWNERSHIP_TYPE_OPTIONS.map((opt) => {
                const selected = ownershipType === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => setOwnershipType(opt.value)}
                    style={[styles.fuelChip, selected && styles.fuelChipSelected]}
                  >
                    <Text
                      style={[styles.fuelChipText, selected && styles.fuelChipTextSelected]}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
              </>
            ) : null}

            {showPersonRideFields ? (
              <View style={styles.row}>
                <View style={[styles.fieldGroup, styles.half]}>
                  <Text style={styles.fieldLabel}>
                    {t("vehicle.form.seatingCapacity", "Seating capacity")}
                  </Text>
                  <Pressable
                    onPress={() => setSeatingPickerOpen(true)}
                    style={styles.dropdownTrigger}
                  >
                    <Ionicons name="people-outline" size={18} color="#94A3B8" />
                    <Text
                      style={[
                        styles.dropdownText,
                        seatingCapacity.trim()
                          ? styles.seatingValueText
                          : styles.dropdownPlaceholder,
                      ]}
                    >
                      {seatingCapacity.trim()
                        ? seatingCapacity.trim()
                        : t("vehicle.form.seatingPh", "Select 1–10")}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#64748B" />
                  </Pressable>
                </View>
                <View style={[styles.fieldGroup, styles.half]}>
                  <Text style={[styles.fieldLabel, acTypeDisabled && styles.fieldLabelDisabled]}>
                    {t("vehicle.form.acType", "AC type")}
                  </Text>
                  <View style={styles.acChipRow}>
                    {AC_TYPE_OPTIONS.map((opt) => {
                      const selected = !acTypeDisabled && acType === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          disabled={acTypeDisabled}
                          onPress={() => setAcType(selected ? null : opt.value)}
                          style={[
                            styles.fuelChip,
                            styles.acChipFlex,
                            selected && styles.fuelChipSelected,
                            acTypeDisabled && styles.fuelChipDisabled,
                          ]}
                        >
                          <Text
                            style={[
                              styles.fuelChipText,
                              selected && styles.fuelChipTextSelected,
                              acTypeDisabled && styles.fuelChipTextDisabled,
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {displayError ? (
          <View style={styles.errorBanner}>
            <Ionicons name="warning-outline" size={16} color="#B91C1C" />
            <Text style={styles.errorText}>{displayError}</Text>
          </View>
        ) : null}

        {showStep1Section && !isCompact ? (
          <Pressable
            onPress={handleContinue}
            disabled={!canContinueStep1}
            style={[styles.saveBtn, !canContinueStep1 && styles.saveBtnDisabled]}
          >
            <Text style={styles.saveBtnText}>
              {t("vehicle.form.continue", "Continue")}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
          </Pressable>
        ) : showStep2Section || isCompact ? (
          <View style={styles.stepActions}>
            {showBackButton ? (
            <Pressable
              onPress={() => {
                setLocalError(null);
                onDismissError?.();
                setStep(1);
              }}
              style={styles.backBtn}
            >
              <Ionicons name="arrow-back" size={18} color={TEAL} />
              <Text style={styles.backBtnText}>{t("common.back", "Back")}</Text>
            </Pressable>
            ) : null}
            <Pressable
              onPress={() => void handleSave()}
              disabled={!canSubmitStep2 || submitting}
              style={[
                styles.saveBtn,
                styles.saveBtnFlex,
                (!canSubmitStep2 || submitting) && styles.saveBtnDisabled,
                !showBackButton && styles.saveBtnFullWidth,
              ]}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Text style={styles.saveBtnText}>
                    {compactSingleStep
                      ? t("vehicle.form.saveCompact", "Save & go online")
                      : t("vehicle.form.save", "Save vehicle details")}
                  </Text>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                </>
              )}
            </Pressable>
          </View>
        ) : null}

        {onSkip ? (
          <Pressable
            onPress={onSkip}
            disabled={submitting}
            hitSlop={8}
            style={styles.skipBtn}
          >
            <Text style={styles.skipBtnText}>
              {t("vehicle.sheet.skip", "Skip for now")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={servicePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setServicePickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setServicePickerOpen(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {t("vehicle.form.serviceTypes", "Services you will deliver")}
            </Text>
            {allowedServiceOptions.map((opt) => {
              const checked = isServiceOptionSelected(selectedServices, opt.value);
              return (
                <Pressable
                  key={opt.value}
                  onPress={() =>
                    setSelectedServices((prev) => toggleServiceSelection(prev, opt.value))
                  }
                  style={styles.checkRow}
                >
                  <Ionicons
                    name={checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={checked ? TEAL : "#94A3B8"}
                  />
                  <Text style={styles.checkLabel}>{opt.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setServicePickerOpen(false)}
              style={styles.modalDoneBtn}
            >
              <Text style={styles.modalDoneText}>{t("common.done", "Done")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={seatingPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSeatingPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSeatingPickerOpen(false)}
        >
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {t("vehicle.form.seatingCapacity", "Seating capacity")}
            </Text>
            <View style={styles.seatingGrid}>
              {RIDER_SEATING_CAPACITY_OPTIONS.map((n) => {
                const selected = seatingCapacity === String(n);
                return (
                  <Pressable
                    key={n}
                    onPress={() => {
                      setSeatingCapacity(String(n));
                      setSeatingPickerOpen(false);
                    }}
                    style={[styles.seatingChip, selected && styles.fuelChipSelected]}
                  >
                    <Text
                      style={[
                        styles.seatingChipText,
                        selected && styles.fuelChipTextSelected,
                      ]}
                    >
                      {n}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  stepLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
    color: "#64748B",
  },
  stepDots: {
    flexDirection: "row",
    gap: 6,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
  },
  stepDotActive: {
    backgroundColor: TEAL,
  },
  scroll: {
    gap: 10,
  },
  scrollContent: {
    flexGrow: 0,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
    color: "#334155",
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: LORA_SEMIBOLD,
    color: "#475569",
    marginTop: 6,
  },
  fieldLabelDisabled: {
    color: "#94A3B8",
  },
  required: {
    color: "#DC2626",
  },
  hintText: {
    fontSize: 12,
    fontFamily: LORA_REGULAR,
    color: "#64748B",
    marginTop: 4,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  typeChipSelected: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  typeChipLocked: {
    alignSelf: "flex-start",
  },
  lockedTypeRow: {
    gap: 6,
    marginBottom: 4,
  },
  typeChipText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: LORA_SEMIBOLD,
    color: TEAL,
  },
  typeChipTextSelected: {
    color: "#FFFFFF",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  fuelChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  fuelChipSelected: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  fuelChipText: {
    fontSize: 13,
    fontWeight: "600",
    fontFamily: LORA_SEMIBOLD,
    color: "#475569",
  },
  fuelChipTextSelected: {
    color: "#FFFFFF",
  },
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  dropdownText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    fontFamily: LORA_REGULAR,
    color: "#0F172A",
  },
  dropdownPlaceholder: {
    color: "#94A3B8",
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#0F172A",
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  half: {
    flex: 1,
  },
  fieldGroup: {
    gap: 6,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#B91C1C",
  },
  stepActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  backBtnText: {
    color: TEAL,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: TEAL,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 8,
  },
  saveBtnFlex: {
    flex: 1,
    marginTop: 0,
  },
  saveBtnFullWidth: {
    flex: 1,
  },
  verifiedSummary: {
    backgroundColor: colors.primary[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary[100],
    padding: 12,
    gap: 4,
  },
  verifiedSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  verifiedSummaryTitle: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
    color: "#334155",
  },
  verifiedSummaryLine: {
    fontSize: 12,
    fontFamily: LORA_REGULAR,
    color: "#475569",
    lineHeight: 18,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
  },
  footer: {
    paddingTop: 8,
    gap: 8,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  skipBtnText: {
    fontSize: 14,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
    color: "#64748B",
  },
  fuelChipDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: "#E2E8F0",
    opacity: 0.55,
  },
  fuelChipTextDisabled: {
    color: "#94A3B8",
  },
  acChipRow: {
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    alignItems: "stretch",
  },
  acChipFlex: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  seatingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  seatingChip: {
    width: 52,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
  },
  seatingChipText: {
    fontSize: 16,
    fontWeight: "600",
    fontFamily: POPPINS_SEMIBOLD,
    color: "#475569",
  },
  seatingValueText: {
    fontFamily: POPPINS_SEMIBOLD,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    gap: 4,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: LORA_BOLD,
    color: "#0F172A",
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  checkLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: "#334155",
  },
  modalDoneBtn: {
    marginTop: 12,
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalDoneText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
