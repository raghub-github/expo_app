import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";

export type PersonRideFlowStep =
  | "accept"
  | "reach"
  | "otp"
  | "start"
  | "complete";

type Props = {
  activeStep: PersonRideFlowStep;
  orderDelivered?: boolean;
};

const STEPS: { id: PersonRideFlowStep; labelKey: string; defaultLabel: string }[] = [
  { id: "accept", labelKey: "orders.activeRide.flowAccept", defaultLabel: "Accept" },
  { id: "reach", labelKey: "orders.activeRide.flowReach", defaultLabel: "Reach" },
  { id: "otp", labelKey: "orders.activeRide.flowOtp", defaultLabel: "OTP" },
  { id: "start", labelKey: "orders.activeRide.flowStart", defaultLabel: "Start" },
  { id: "complete", labelKey: "orders.activeRide.flowComplete", defaultLabel: "Complete" },
];

function stepIndex(step: PersonRideFlowStep): number {
  return STEPS.findIndex((s) => s.id === step);
}

export function PersonRideFlowSteps({ activeStep, orderDelivered }: Props) {
  const { t } = useTranslation();
  const activeIdx = orderDelivered ? STEPS.length : stepIndex(activeStep);

  return (
    <View style={styles.row}>
      {STEPS.map((step, idx) => {
        const done = idx < activeIdx;
        const current = idx === activeIdx && !orderDelivered;
        return (
          <View key={step.id} style={styles.stepWrap}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                current && styles.dotCurrent,
              ]}
            >
              {done ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={[styles.dotNum, current && styles.dotNumCurrent]}>{idx + 1}</Text>
              )}
            </View>
            <Text
              style={[styles.label, (done || current) && styles.labelActive]}
              numberOfLines={1}
            >
              {t(step.labelKey, step.defaultLabel)}
            </Text>
            {idx < STEPS.length - 1 ? (
              <View style={[styles.connector, done && styles.connectorDone]} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  stepWrap: {
    flex: 1,
    alignItems: "center",
    position: "relative",
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gray[200],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  dotDone: {
    backgroundColor: colors.success[600],
  },
  dotCurrent: {
    backgroundColor: colors.secondary[600],
  },
  dotNum: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.gray[600],
  },
  dotNumCurrent: {
    color: "#fff",
  },
  label: {
    fontSize: 9,
    fontWeight: "600",
    color: colors.gray[400],
    textAlign: "center",
  },
  labelActive: {
    color: colors.gray[800],
    fontWeight: "800",
  },
  connector: {
    position: "absolute",
    top: 11,
    left: "58%",
    right: "-42%",
    height: 2,
    backgroundColor: colors.gray[200],
    zIndex: -1,
  },
  connectorDone: {
    backgroundColor: colors.success[300],
  },
});
