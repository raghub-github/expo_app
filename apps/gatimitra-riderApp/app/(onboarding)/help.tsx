import React, { useState } from "react";
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";

export default function HelpScreen() {
  const { t } = useTranslation();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      Alert.alert("Error", "Please fill in both subject and message");
      return;
    }

    setLoading(true);
    try {
      // TODO: Submit ticket to backend
      // For now, just show success message
      Alert.alert(
        "Ticket Submitted",
        "Your ticket has been submitted. Our support team will get back to you soon.",
        [
          {
            text: "OK",
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (error) {
      Alert.alert("Error", "Failed to submit ticket. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ marginBottom: 32 }}>
            <Text style={{ fontSize: 28, fontWeight: "bold", color: "#111827", marginBottom: 8 }}>
              Get Help
            </Text>
            <Text style={{ fontSize: 16, color: "#6B7280" }}>
              Raise a ticket for non-order related issues. Our support team will assist you.
            </Text>
          </View>

          {/* Form */}
          <View style={{ flex: 1 }}>
            <View style={{ marginBottom: 20 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                Subject
              </Text>
              <TextInput
                value={subject}
                onChangeText={setSubject}
                placeholder="Enter subject"
                placeholderTextColor={colors.gray[400]}
                style={{
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  fontSize: 16,
                  color: "#111827",
                }}
              />
            </View>

            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "#374151", marginBottom: 8 }}>
                Message
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Describe your issue..."
                placeholderTextColor={colors.gray[400]}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
                style={{
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 16,
                  fontSize: 16,
                  color: "#111827",
                  minHeight: 120,
                }}
              />
            </View>

            <Button onPress={handleSubmit} loading={loading} disabled={loading} size="lg">
              Submit Ticket
            </Button>

            <Button
              variant="ghost"
              onPress={() => router.back()}
              size="sm"
              style={{ marginTop: 12 }}
            >
              Cancel
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

