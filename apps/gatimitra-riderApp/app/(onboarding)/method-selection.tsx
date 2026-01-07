import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { Logo } from "@/src/components/Logo";

type OnboardingMethod = "manual" | "karza" | "digilocker";

interface MethodCardProps {
  method: OnboardingMethod;
  title: string;
  description: string;
  documents: string[];
  estimatedTime: string;
  enabled: boolean;
  onSelect: () => void;
}

function MethodCard({ method, title, description, documents, estimatedTime, enabled, onSelect }: MethodCardProps) {
  const getIcon = () => {
    switch (method) {
      case "manual":
        return "📄";
      case "karza":
        return "⚡";
      case "digilocker":
        return "🔐";
    }
  };

  const getBadge = () => {
    if (enabled) {
      return (
        <View style={styles.enabledBadge}>
          <Text style={styles.enabledBadgeText}>Available</Text>
        </View>
      );
    }
    return (
      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonBadgeText}>Coming Soon</Text>
      </View>
    );
  };

  return (
    <View
      style={[
        styles.card,
        !enabled && styles.cardDisabled,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{getIcon()}</Text>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardTitle, !enabled && styles.cardTitleDisabled]}>{title}</Text>
          {getBadge()}
        </View>
      </View>

      <Text style={[styles.cardDescription, !enabled && styles.cardDescriptionDisabled]}>
        {description}
      </Text>

      <View style={styles.documentsContainer}>
        <Text style={[styles.documentsTitle, !enabled && styles.documentsTitleDisabled]}>
          Documents Required:
        </Text>
        {documents.map((doc, index) => (
          <Text key={index} style={[styles.documentItem, !enabled && styles.documentItemDisabled]}>
            • {doc}
          </Text>
        ))}
      </View>

      <View style={styles.timeContainer}>
        <Text style={[styles.timeText, !enabled && styles.timeTextDisabled]}>
          ⏱️ Estimated time: {estimatedTime}
        </Text>
      </View>

      <Button
        onPress={onSelect}
        disabled={!enabled}
        variant={enabled ? "primary" : "outline"}
        size="lg"
        style={styles.cardButton}
      >
        {enabled ? "Start Onboarding" : "Coming Soon"}
      </Button>
    </View>
  );
}

export default function MethodSelectionScreen() {
  const { t } = useTranslation();
  const { setData } = useOnboardingStore();

  const handleMethodSelect = async (method: OnboardingMethod) => {
    if (method === "manual") {
      // Save method to store
      await setData({ onboardingMethod: method });
      // Redirect to manual onboarding flow (Aadhaar first)
      router.push("/(onboarding)/aadhaar");
    } else {
      // Karza and DigiLocker are disabled for now
      // Future: router.push(`/(onboarding)/${method}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Logo size="medium" style={{ marginBottom: 16 }} />
          <Text style={styles.title}>Choose Onboarding Method</Text>
          <Text style={styles.subtitle}>
            Select how you'd like to complete your verification
          </Text>
        </View>

        {/* Method Cards */}
        <View style={styles.cardsContainer}>
          <MethodCard
            method="manual"
            title="Manual Onboarding"
            description="Upload your documents manually. Complete verification by submitting Aadhaar, PAN, DL, and RC documents with photos."
            documents={[
              "Aadhaar (photo + number + name + DOB)",
              "PAN (photo + number + selfie)",
              "DL (number + photo)",
              "RC (number + photo)",
            ]}
            estimatedTime="10-15 minutes"
            enabled={true}
            onSelect={() => handleMethodSelect("manual")}
          />

          <MethodCard
            method="karza"
            title="Fast Onboarding with Karza"
            description="Quick verification using Karza API. Fewer documents needed, faster approval process."
            documents={[
              "Aadhaar (verified via API)",
              "PAN (verified via API)",
              "Selfie for face match",
            ]}
            estimatedTime="5-8 minutes"
            enabled={false}
            onSelect={() => handleMethodSelect("karza")}
          />

          <MethodCard
            method="digilocker"
            title="Onboarding with DigiLocker"
            description="Verify Aadhaar using DigiLocker. Other documents will be verified via Karza API."
            documents={[
              "Aadhaar (via DigiLocker)",
              "PAN (via Karza API)",
              "DL & RC (via Karza API)",
            ]}
            estimatedTime="5-10 minutes"
            enabled={false}
            onSelect={() => handleMethodSelect("digilocker")}
          />
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            💡 Manual onboarding is currently available. Karza and DigiLocker integrations will be available soon.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.gray[900],
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray[600],
    textAlign: "center",
  },
  cardsContainer: {
    gap: 20,
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: colors.primary[200],
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardDisabled: {
    borderColor: colors.gray[300],
    backgroundColor: colors.gray[50],
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  cardIcon: {
    fontSize: 40,
    marginRight: 12,
  },
  cardHeaderText: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.gray[900],
  },
  cardTitleDisabled: {
    color: colors.gray[500],
  },
  enabledBadge: {
    backgroundColor: colors.success[100],
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  enabledBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.success[700],
    textTransform: "uppercase",
  },
  comingSoonBadge: {
    backgroundColor: colors.gray[200],
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  comingSoonBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gray[600],
    textTransform: "uppercase",
  },
  cardDescription: {
    fontSize: 14,
    color: colors.gray[700],
    lineHeight: 20,
    marginBottom: 16,
  },
  cardDescriptionDisabled: {
    color: colors.gray[500],
  },
  documentsContainer: {
    backgroundColor: colors.primary[50],
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  documentsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.primary[700],
    marginBottom: 8,
  },
  documentsTitleDisabled: {
    color: colors.gray[500],
  },
  documentItem: {
    fontSize: 13,
    color: colors.gray[700],
    lineHeight: 20,
    marginBottom: 4,
  },
  documentItemDisabled: {
    color: colors.gray[500],
  },
  timeContainer: {
    marginBottom: 16,
  },
  timeText: {
    fontSize: 13,
    color: colors.gray[600],
    fontStyle: "italic",
  },
  timeTextDisabled: {
    color: colors.gray[400],
  },
  cardButton: {
    width: "100%",
  },
  infoBox: {
    backgroundColor: colors.primary[50],
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  infoText: {
    fontSize: 13,
    color: colors.primary[800],
    lineHeight: 18,
    textAlign: "center",
  },
});
