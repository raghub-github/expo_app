import React from "react";
import { View, Text, ScrollView, Pressable, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { useSessionStore } from "@/src/stores/sessionStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const setSession = useSessionStore((s) => s.setSession);
  const [dutyStatus, setDutyStatus] = React.useState<"ON" | "OFF">("OFF");

  const onLogout = async () => {
    await setSession(null);
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }} className="flex-1 bg-gray-50">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }} className="px-6 pt-6 pb-8">
          {/* Header */}
          <View style={{ alignItems: 'center', marginBottom: 32 }} className="items-center mb-8">
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden', borderWidth: 2, borderColor: colors.primary[200] }} className="w-24 h-24 rounded-full bg-white items-center justify-center mb-4">
              <Image
                source={require('../../assets/images/onlylogo.png')}
                style={{ width: 80, height: 80, resizeMode: 'contain' }}
              />
            </View>
            <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#111827', marginBottom: 4 }} className="text-2xl font-bold text-gray-900 mb-1">{t("profile.riderName")}</Text>
            <Text style={{ fontSize: 14, color: '#4B5563' }} className="text-sm text-gray-600">
              ID: RDR{session?.userId.slice(0, 8).toUpperCase()}
            </Text>
          </View>

          {/* Duty Toggle */}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }} className="bg-white rounded-xl p-4 mb-6 shadow-sm">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }} className="flex-row items-center justify-between mb-4">
              <View>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 4 }} className="text-lg font-bold text-gray-900 mb-1">{t("profile.dutyStatus")}</Text>
                <Text style={{ fontSize: 14, color: '#4B5563' }} className="text-sm text-gray-600">
                  {dutyStatus === "ON" ? t("profile.currentlyOnDuty") : t("profile.currentlyOffDuty")}
                </Text>
              </View>
              <Pressable
                onPress={() => setDutyStatus(dutyStatus === "ON" ? "OFF" : "ON")}
                style={{
                  width: 64,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: dutyStatus === "ON" ? colors.success[500] : '#D1D5DB',
                  justifyContent: 'center',
                  paddingHorizontal: 4,
                }}
                className={`w-16 h-8 rounded-full ${
                  dutyStatus === "ON" ? "bg-success-500" : "bg-gray-300"
                } justify-center`}
              >
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: '#FFFFFF',
                    transform: [{ translateX: dutyStatus === "ON" ? 28 : 0 }],
                  }}
                  className="w-7 h-7 rounded-full bg-white"
                />
              </Pressable>
            </View>
            <Button
              variant={dutyStatus === "ON" ? "outline" : "primary"}
              onPress={() => setDutyStatus(dutyStatus === "ON" ? "OFF" : "ON")}
            >
              {dutyStatus === "ON" ? t("profile.goOffDuty") : t("profile.goOnDuty")}
            </Button>
          </View>

          {/* Profile Sections */}
          <View style={{ gap: 16, marginBottom: 24 }} className="space-y-4 mb-6">
            <ProfileSection
              title={t("profile.account")}
              items={[
                { label: t("profile.kycStatus"), value: t("profile.verified"), status: "success" },
                { label: t("profile.vehicle"), value: "Bike - MH01AB1234" },
                { label: t("profile.city"), value: "Mumbai" },
              ]}
            />
            <ProfileSection
              title={t("profile.settings")}
              items={[
                { label: t("profile.language"), value: t("profile.enabled"), action: t("profile.change") },
                { label: t("profile.notifications"), value: t("profile.enabled"), action: t("profile.manage") },
              ]}
            />
            <ProfileSection
              title={t("profile.support")}
              items={[
                { label: t("profile.helpCenter"), action: t("profile.view") },
                { label: t("profile.raiseTicket"), action: t("profile.create") },
                { label: t("profile.contactSupport"), action: t("profile.call") },
              ]}
            />
          </View>

          {/* Logout */}
          <Button variant="outline" onPress={onLogout} style={{ borderColor: colors.error[200] }} className="border-error-200">
            <Text style={{ color: colors.error[600], fontWeight: '600' }} className="text-error-600 font-semibold">{t("profile.logout")}</Text>
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ProfileSection({
  title,
  items,
}: {
  title: string;
  items: Array<{
    label: string;
    value?: string;
    status?: "success" | "warning" | "error";
    action?: string;
  }>;
}) {
  return (
    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 2 }} className="bg-white rounded-xl p-4 shadow-sm">
      <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 16 }} className="text-base font-bold text-gray-900 mb-4">{title}</Text>
      {items.map((item, idx) => (
        <Pressable
          key={idx}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: 12,
            borderBottomWidth: idx < items.length - 1 ? 1 : 0,
            borderBottomColor: '#F3F4F6',
          }}
          className={`flex-row items-center justify-between py-3 ${
            idx < items.length - 1 ? "border-b border-gray-100" : ""
          }`}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, color: '#111827', marginBottom: 4 }} className="text-base text-gray-900 mb-1">{item.label}</Text>
            {item.value && (
              <Text
                style={{
                  fontSize: 14,
                  color: item.status === "success"
                    ? colors.success[600]
                    : item.status === "warning"
                      ? colors.warning[600]
                      : item.status === "error"
                        ? colors.error[600]
                        : '#4B5563'
                }}
                className={`text-sm ${
                  item.status === "success"
                    ? "text-success-600"
                    : item.status === "warning"
                      ? "text-warning-600"
                      : item.status === "error"
                        ? "text-error-600"
                        : "text-gray-600"
                }`}
              >
                {item.value}
              </Text>
            )}
          </View>
          {item.action && (
            <Text style={{ fontSize: 14, color: colors.primary[600], fontWeight: '500' }} className="text-sm text-primary-600 font-medium">{item.action} →</Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}
