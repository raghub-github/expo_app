import React from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useEarningsSummary } from "@/src/hooks/useEarnings";
import { colors } from "@/src/theme";

export default function EarningsScreen() {
  const { t } = useTranslation();
  const { data: earnings, isLoading, error } = useEarningsSummary();

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} className="flex-1 bg-gray-50">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }} className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary[500]} size="large" />
          <Text style={{ marginTop: 16, color: '#4B5563' }} className="mt-4 text-gray-600">{t("earnings.loading", "Loading earnings...")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} className="flex-1 bg-gray-50">
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }} className="flex-1 items-center justify-center px-6">
          <Text style={{ fontSize: 20, fontWeight: '600', color: '#111827', marginBottom: 8 }} className="text-xl font-semibold text-gray-900 mb-2">
            {t("earnings.error", "Failed to load earnings")}
          </Text>
          <Text style={{ color: '#4B5563', textAlign: 'center' }} className="text-gray-600 text-center">
            {t("earnings.errorMessage", "Please try again later")}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} className="flex-1 bg-gray-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }} className="px-6 pt-6 pb-8">
          {/* Header */}
          <View style={{ marginBottom: 24 }} className="mb-6">
            <Text style={{ fontSize: 30, fontWeight: 'bold', color: '#111827', marginBottom: 8 }} className="text-3xl font-bold text-gray-900 mb-2">{t("earnings.title")}</Text>
            <Text style={{ fontSize: 16, color: '#4B5563' }} className="text-base text-gray-600">{t("earnings.subtitle")}</Text>
          </View>

          {/* Balance Card */}
          <View style={{ backgroundColor: colors.primary[500], borderRadius: 16, padding: 24, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }} className="bg-gradient-to-br from-primary-500 to-primary-600 rounded-2xl p-6 mb-6 shadow-lg">
            <Text style={{ fontSize: 14, color: '#FFE0D1', marginBottom: 8 }} className="text-sm text-primary-100 mb-2">{t("earnings.totalBalance")}</Text>
            <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 }} className="text-4xl font-bold text-white mb-1">
              {earnings ? formatCurrency(earnings.totalBalance) : "₹0"}
            </Text>
            <Text style={{ fontSize: 14, color: '#FFE0D1' }} className="text-sm text-primary-100">{t("earnings.availableForWithdrawal")}</Text>
          </View>

          {/* Quick Stats */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }} className="flex-row gap-3 mb-6">
            <StatCard
              label={t("earnings.thisWeek")}
              value={earnings ? formatCurrency(earnings.thisWeek) : "₹0"}
            />
            <StatCard
              label={t("earnings.thisMonth")}
              value={earnings ? formatCurrency(earnings.thisMonth) : "₹0"}
            />
          </View>

          {/* Breakdown */}
          {earnings && (
            <>
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16 }} className="bg-white rounded-xl p-4 mb-4">
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 }} className="text-lg font-bold text-gray-900 mb-4">{t("earnings.breakdown")}</Text>
                <EarningItem
                  label={t("earnings.foodOrders")}
                  amount={formatCurrency(earnings.breakdown.food)}
                />
                <EarningItem
                  label={t("earnings.parcelOrders")}
                  amount={formatCurrency(earnings.breakdown.parcel)}
                />
                <EarningItem
                  label={t("earnings.rideTrips")}
                  amount={formatCurrency(earnings.breakdown.ride)}
                />
                <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 12, marginTop: 12 }}>
                  <EarningItem
                    label={t("earnings.total")}
                    amount={formatCurrency(earnings.totalBalance)}
                    bold
                  />
                </View>
              </View>

              {/* Withdrawable vs Locked */}
              <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16 }} className="bg-white rounded-xl p-4 mb-4">
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 }} className="text-lg font-bold text-gray-900 mb-4">{t("earnings.walletStatus")}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ fontSize: 16, color: '#374151' }} className="text-base text-gray-700">{t("earnings.withdrawable")}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: colors.success[600] }}>
                    {formatCurrency(earnings.withdrawable)}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, color: '#374151' }} className="text-base text-gray-700">{t("earnings.locked")}</Text>
                  <Text style={{ fontSize: 18, fontWeight: '600', color: colors.warning[600] }}>
                    {formatCurrency(earnings.locked)}
                  </Text>
                </View>
              </View>
            </>
          )}

          {/* Action Button */}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16 }}>
            <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 12, textAlign: 'center' }} className="text-sm text-gray-600 mb-3 text-center">{t("earnings.withdrawalNote")}</Text>
            <View style={{ backgroundColor: colors.primary[500], borderRadius: 12, paddingVertical: 16, alignItems: 'center' }}>
              <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 16 }} className="text-white font-semibold text-base">{t("earnings.requestWithdrawal")}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }} className="flex-1 bg-white rounded-xl p-4 shadow-sm">
      <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 4 }} className="text-sm text-gray-600 mb-1">{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827' }} className="text-2xl font-bold text-gray-900">{value}</Text>
    </View>
  );
}

function EarningItem({ label, amount, bold }: { label: string; amount: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
      <Text style={{ fontSize: 16, fontWeight: bold ? 'bold' : 'normal', color: bold ? '#111827' : '#374151' }}>
        {label}
      </Text>
      <Text style={{ fontSize: 16, fontWeight: bold ? 'bold' : '600', color: '#111827' }}>
        {amount}
      </Text>
    </View>
  );
}
