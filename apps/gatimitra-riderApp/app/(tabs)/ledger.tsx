import React, { useState } from "react";
import { View, Text, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";

export default function LedgerScreen() {
  const { t } = useTranslation();
  const [selectedSegment, setSelectedSegment] = useState<"all" | "food" | "parcel" | "ride" | "incentives" | "penalties">("all");

  const segments = [
    { id: "all" as const, label: t("ledger.all") },
    { id: "food" as const, label: t("ledger.food") },
    { id: "parcel" as const, label: t("ledger.parcel") },
    { id: "ride" as const, label: t("ledger.ride") },
    { id: "incentives" as const, label: t("ledger.incentives") },
    { id: "penalties" as const, label: t("ledger.penalties") },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} className="flex-1 bg-gray-50">
      <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 }} className="px-6 pt-6 pb-4">
        <Text style={{ fontSize: 30, fontWeight: 'bold', color: '#111827', marginBottom: 8 }} className="text-3xl font-bold text-gray-900 mb-2">{t("ledger.title")}</Text>
        <Text style={{ fontSize: 16, color: '#4B5563', marginBottom: 16 }} className="text-base text-gray-600 mb-4">{t("ledger.subtitle")}</Text>

        {/* Segment Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} className="mb-4">
          <View style={{ flexDirection: 'row', gap: 8 }} className="flex-row gap-2">
            {segments.map((seg) => (
              <Pressable
                key={seg.id}
                onPress={() => setSelectedSegment(seg.id)}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 8,
                  backgroundColor: selectedSegment === seg.id ? colors.primary[500] : '#FFFFFF',
                }}
                className={`px-4 py-2 rounded-lg ${
                  selectedSegment === seg.id ? "bg-primary-500" : "bg-white"
                }`}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '500',
                    color: selectedSegment === seg.id ? '#FFFFFF' : '#374151',
                  }}
                  className={`text-sm font-medium ${
                    selectedSegment === seg.id ? "text-white" : "text-gray-700"
                  }`}
                >
                  {seg.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} className="flex-1">
        <View style={{ paddingHorizontal: 24, paddingBottom: 32 }} className="px-6 pb-8">
          {/* Date Filter */}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} className="bg-white rounded-xl p-4 mb-4 flex-row justify-between items-center">
            <Text style={{ fontSize: 16, fontWeight: '500', color: '#374151' }} className="text-base font-medium text-gray-700">{t("ledger.thisMonth")}</Text>
            <Text style={{ fontSize: 14, color: colors.primary[600] }} className="text-sm text-primary-600">{t("ledger.changePeriod")}</Text>
          </View>

          {/* Transactions */}
          <View style={{ gap: 8 }} className="space-y-2">
            <LedgerItem
              type="credit"
              category={t("ledger.food")}
              description="Order #12345"
              amount={150}
              date="2024-12-19 14:30"
            />
            <LedgerItem
              type="credit"
              category={t("ledger.parcel")}
              description="Order #12346"
              amount={200}
              date="2024-12-19 12:15"
            />
            <LedgerItem
              type="credit"
              category={t("ledger.incentives")}
              description="Weekly bonus"
              amount={500}
              date="2024-12-18 10:00"
            />
            <LedgerItem
              type="debit"
              category={t("ledger.penalties")}
              description="Late delivery"
              amount={50}
              date="2024-12-17 16:45"
            />
            <LedgerItem
              type="credit"
              category={t("ledger.ride")}
              description="Trip #789"
              amount={300}
              date="2024-12-17 09:20"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LedgerItem({
  type,
  category,
  description,
  amount,
  date,
}: {
  type: "credit" | "debit";
  category: string;
  description: string;
  amount: number;
  date: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }} className="bg-white rounded-xl p-4 flex-row items-center justify-between">
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>{category}</Text>
          <View style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 4,
            backgroundColor: type === "credit" ? '#DCFCE7' : '#FEE2E2',
          }}>
            <Text style={{
              fontSize: 12,
              fontWeight: '500',
              color: type === "credit" ? colors.success[700] : colors.error[700],
            }}>
              {type === "credit" ? "+" : "-"}
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 4 }}>{description}</Text>
        <Text style={{ fontSize: 12, color: '#6B7280' }}>{date}</Text>
      </View>
      <Text style={{
        fontSize: 18,
        fontWeight: 'bold',
        color: type === "credit" ? colors.success[600] : colors.error[600],
      }}>
        {type === "credit" ? "+" : "-"}₹{amount}
      </Text>
    </View>
  );
}
