import React, { useState } from "react";
import { View, Text, Pressable, Modal, ScrollView, Image } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { DutyToggle } from "./DutyToggle";
import { SUPPORTED_LANGUAGES } from "@/src/stores/languageStore";

export function GlobalTopBar() {
  const { i18n, t } = useTranslation();
  const [showLangModal, setShowLangModal] = useState(false);
  const [showNotifModal, setShowNotifModal] = useState(false);

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    setShowLangModal(false);
  };

  return (
    <SafeAreaView edges={["top"]} style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }} className="bg-white border-b border-gray-200">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }} className="flex-row items-center justify-between px-4 py-3">
        {/* Language Switcher */}
        <Pressable
          onPress={() => setShowLangModal(true)}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F3F4F6' }}
          className="flex-row items-center px-3 py-2 rounded-lg bg-gray-100"
        >
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#374151' }} className="text-sm font-medium text-gray-700">{currentLang.code.toUpperCase()}</Text>
        </Pressable>

        {/* Duty Toggle - Compact version for navbar */}
        <View style={{ marginHorizontal: 4 }}>
          <DutyToggle compact />
        </View>

        {/* App Logo (onlylogo.png) */}
        <View style={{ flex: 1, alignItems: 'center' }} className="flex-1 items-center">
          <Image
            source={require('../../assets/images/onlylogo.png')}
            style={{ width: 50, height: 50, resizeMode: 'contain' }}
          />
        </View>

        {/* Notifications */}
        <Pressable
          onPress={() => setShowNotifModal(true)}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
          className="w-10 h-10 items-center justify-center"
        >
          <View style={{ position: 'relative' }}>
            <Ionicons name="notifications-outline" size={24} color={colors.gray[700]} />
            <View style={{ position: 'absolute', top: 0, right: 0, width: 12, height: 12, backgroundColor: colors.error[500], borderRadius: 6, borderWidth: 2, borderColor: '#FFFFFF' }} />
          </View>
        </Pressable>

        {/* Help / Ticket */}
        <Pressable
          onPress={() => {
            router.push("/(onboarding)/help");
          }}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          className="w-10 h-10 items-center justify-center"
        >
          <Ionicons name="help-circle-outline" size={24} color={colors.gray[700]} />
        </Pressable>
      </View>

      {/* Language Modal */}
      <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', alignItems: 'center', justifyContent: 'center' }}
          className="flex-1 bg-black/50 items-center justify-center"
          onPress={() => setShowLangModal(false)}
        >
          <Pressable style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, width: 320, maxHeight: '80%' }} className="bg-white rounded-2xl p-6 w-80 max-h-[80%]" onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827', marginBottom: 16 }} className="text-xl font-bold text-gray-900 mb-4">{t("topbar.selectLanguage")}</Text>
            <ScrollView style={{ maxHeight: 384 }} showsVerticalScrollIndicator={false}>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = i18n.language === lang.code;
                return (
                  <Pressable
                    key={lang.code}
                    onPress={() => changeLanguage(lang.code)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: 16,
                      borderRadius: 12,
                      marginBottom: 8,
                      backgroundColor: isSelected ? colors.success[50] : '#FFFFFF',
                      borderWidth: 1,
                      borderColor: isSelected ? colors.success[200] : '#E5E7EB',
                    }}
                  >
                    <Text style={{
                      fontSize: 16,
                      fontWeight: '500',
                      color: isSelected ? colors.success[700] : '#111827',
                    }}>
                      {lang.native}
                    </Text>
                    {isSelected && (
                      <Ionicons 
                        name="checkmark" 
                        size={20} 
                        color={colors.success[600]} 
                        style={{ marginLeft: 8 }}
                      />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => setShowLangModal(false)}
              style={{ marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' }}
              className="mt-4 bg-white rounded-xl py-3 items-center"
            >
              <Text style={{ fontSize: 16, fontWeight: '500', color: '#111827' }} className="text-base font-medium text-gray-900">{t("topbar.cancel")}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={showNotifModal} transparent animationType="slide" onRequestClose={() => setShowNotifModal(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} className="flex-1 bg-white">
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }} className="flex-row items-center justify-between px-4 py-4 border-b border-gray-200">
              <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }} className="text-xl font-bold text-gray-900">{t("topbar.notifications")}</Text>
              <Pressable onPress={() => setShowNotifModal(false)}>
                <Text style={{ fontSize: 18, color: '#4B5563' }} className="text-lg text-gray-600">✕</Text>
              </Pressable>
            </View>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
              <Text style={{ fontSize: 40, marginBottom: 16 }}>📬</Text>
              <Text style={{ fontSize: 18, fontWeight: '500', color: '#111827', marginBottom: 8 }} className="text-lg font-medium text-gray-900 mb-2">{t("topbar.noNotifications")}</Text>
              <Text style={{ fontSize: 14, color: '#4B5563', textAlign: 'center' }} className="text-sm text-gray-600 text-center">
                {t("topbar.noNotificationsMessage")}
              </Text>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
