/**
 * Create ticket – subject + description, submit to unified_tickets via API.
 */

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { ticketService } from "@/services/ticket.service";

const TEAL = "#14b8a6";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const CARD_BG = "#FFFFFF";
const PAGE_BG = "#F0F4F3";
const BORDER = "#E5E7EB";

export default function TicketCreateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const sub = subject.trim();
    const desc = description.trim();
    if (!sub || !desc) {
      Alert.alert("Required", "Please enter both subject and description.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await ticketService.createTicket({
        subject: sub,
        description: desc,
        ticket_title: "OTHER",
      });
      queryClient.invalidateQueries({ queryKey: ["support", "tickets"] });
      Alert.alert("Ticket created", "Your ticket " + result.ticket_id + " has been submitted. We will get back to you soon.", [
        { text: "OK", onPress: () => router.replace("/profile/help") },
      ]);
    } catch (e: unknown) {
      const message = e && typeof e === "object" && "response" in e
        ? (e as { response?: { data?: { message?: string; error?: string } } }).response?.data?.message
          ?? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      Alert.alert(
        "Could not create ticket",
        message ?? "Please check your connection and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={styles.form}>
        <Text style={styles.label}>Subject</Text>
        <TextInput
          style={styles.input}
          value={subject}
          onChangeText={setSubject}
          placeholder="Brief summary of your issue"
          placeholderTextColor={TEXT_GRAY}
          maxLength={200}
          editable={!submitting}
        />
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe your issue in detail…"
          placeholderTextColor={TEXT_GRAY}
          multiline
          numberOfLines={5}
          maxLength={5000}
          textAlignVertical="top"
          editable={!submitting}
        />
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.9}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="send-outline" size={20} color="#fff" />
              <Text style={styles.submitText}>Submit ticket</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const PAD_H = 20;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  form: { padding: PAD_H, paddingTop: 16 },
  label: { fontSize: 14, fontWeight: "600", color: TITLE_DARK, marginBottom: 8 },
  input: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: TITLE_DARK,
    marginBottom: 20,
  },
  textArea: { minHeight: 120, paddingTop: 12 },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: TEAL,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitText: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
