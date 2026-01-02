import React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";

export default function OffersScreen() {
  const { t } = useTranslation();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} className="flex-1 bg-gray-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }} className="px-6 pt-6 pb-8">
          <View style={{ marginBottom: 24 }} className="mb-6">
            <Text style={{ fontSize: 30, fontWeight: 'bold', color: '#111827', marginBottom: 8 }} className="text-3xl font-bold text-gray-900 mb-2">{t("offers.title")}</Text>
            <Text style={{ fontSize: 16, color: '#4B5563' }} className="text-base text-gray-600">{t("offers.subtitle")}</Text>
          </View>

          {/* Active Offers */}
          <View style={{ marginBottom: 24 }} className="mb-6">
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 }} className="text-lg font-bold text-gray-900 mb-4">{t("offers.activeOffers")}</Text>
            <OfferCard
              title="Weekend Warrior"
              description="Complete 20 orders this weekend"
              reward="₹500 bonus"
              progress={12}
              target={20}
              type="target"
            />
            <OfferCard
              title="Peak Hour Bonus"
              description="Deliver during 6-9 PM today"
              reward="₹50 per order"
              type="time"
            />
            <OfferCard
              title="Area Champion"
              description="Complete 10 orders in Bandra"
              reward="₹300 bonus"
              progress={7}
              target={10}
              type="area"
            />
          </View>

          {/* Completed Offers */}
          <View>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 16 }} className="text-lg font-bold text-gray-900 mb-4">{t("offers.completed")}</Text>
            <CompletedOfferCard
              title="First 10 Orders"
              description="Completed your first 10 orders"
              reward="₹200"
              completedDate="2024-12-15"
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function OfferCard({
  title,
  description,
  reward,
  progress,
  target,
  type,
}: {
  title: string;
  description: string;
  reward: string;
  progress?: number;
  target?: number;
  type: "target" | "time" | "area";
}) {
  const { t } = useTranslation();
  const progressPercent = progress && target ? (progress / target) * 100 : 0;

  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2, borderWidth: 1, borderColor: colors.primary[200] }} className="bg-white rounded-xl p-4 mb-4 shadow-sm border border-primary-200">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 }}>{title}</Text>
          <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 8 }}>{description}</Text>
          {progress !== undefined && target !== undefined && (
            <View style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 12, color: '#4B5563' }}>
                  {progress} / {target} orders
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary[600] }}>
                  {Math.round(progressPercent)}%
                </Text>
              </View>
              <View style={{ height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' }}>
                <View
                  style={{ height: '100%', backgroundColor: colors.primary[500], borderRadius: 4, width: `${progressPercent}%` }}
                />
              </View>
            </View>
          )}
        </View>
        <View style={{ backgroundColor: colors.primary[100], paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.primary[700] }}>{reward}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: colors.primary[500], borderRadius: 8, paddingVertical: 12, alignItems: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>{t("offers.trackProgress")}</Text>
      </View>
    </View>
  );
}

function CompletedOfferCard({
  title,
  description,
  reward,
  completedDate,
}: {
  title: string;
  description: string;
  reward: string;
  completedDate: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ backgroundColor: '#F3F4F6', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' }} className="bg-gray-100 rounded-xl p-4 mb-4 border border-gray-200">
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827' }}>{title}</Text>
            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: colors.success[700] }}>{t("offers.completed")}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 14, color: '#4B5563', marginBottom: 4 }}>{description}</Text>
          <Text style={{ fontSize: 12, color: '#6B7280' }}>Completed on {completedDate}</Text>
        </View>
        <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, marginLeft: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: 'bold', color: colors.success[700] }}>+{reward}</Text>
        </View>
      </View>
    </View>
  );
}
