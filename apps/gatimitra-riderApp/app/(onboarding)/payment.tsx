import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Alert, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useSessionStore } from "@/src/stores/sessionStore";
import { Button } from "@/src/components/ui/Button";
import { colors } from "@/src/theme";
import { useCreatePaymentOrder, useVerifyPayment } from "@/src/hooks/usePayment";

// TODO: Install Razorpay React Native SDK for production:
// npm install react-native-razorpay
// Then import: import RazorpayCheckout from 'react-native-razorpay';

export default function PaymentScreen() {
  const { t } = useTranslation();
  const session = useSessionStore((s) => s.session);
  const { data, hydrate } = useOnboardingStore();
  const createOrder = useCreatePaymentOrder();
  const verifyPayment = useVerifyPayment();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleInitiatePayment = async () => {
    if (!data.riderId) {
      setError("Rider ID not found");
      return;
    }

    if (!session?.accessToken) {
      setError("Not authenticated. Please login again.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const order = await createOrder.mutateAsync({ riderId: data.riderId });
      setOrderId(order.orderId);

      // TODO: Replace with Razorpay React Native SDK integration
      // Example code (after installing react-native-razorpay):
      /*
      import RazorpayCheckout from 'react-native-razorpay';
      
      const options = {
        description: 'Onboarding Fee',
        image: 'https://your-logo-url.com/logo.png',
        currency: order.currency,
        key: order.key,
        amount: order.amount,
        name: 'GatiMitra',
        order_id: order.orderId,
        prefill: {
          email: '',
          contact: phoneNumber,
          name: riderName,
        },
        theme: { color: '#14b8a6' },
      };

      RazorpayCheckout.open(options)
        .then(async (data) => {
          // Payment successful
          await handleVerifyPayment(order.orderId, data.razorpay_payment_id, data.razorpay_signature);
        })
        .catch((error) => {
          // Payment failed or cancelled
          if (error.code !== 'BAD_REQUEST_ERROR') {
            setError(error.description || 'Payment cancelled');
          }
        });
      */

      // For development: Show simulation option
      if (__DEV__) {
        Alert.alert(
          "Payment Required",
          `Please pay ₹49 for onboarding fee.\n\nOrder ID: ${order.orderId}\n\nIn production, this will open Razorpay checkout.`,
          [
            {
              text: "Cancel",
              style: "cancel",
              onPress: () => setLoading(false),
            },
            {
              text: "Simulate Payment",
              onPress: () => handleSimulatePayment(order.orderId),
            },
          ]
        );
      } else {
        setError("Razorpay SDK not configured. Please contact support.");
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create payment order");
      setLoading(false);
    }
  };

  const handleSimulatePayment = async (razorpayOrderId: string) => {
    // In production, this would be called after Razorpay payment success
    // For now, we simulate with fake payment ID (development only)
    if (!__DEV__) {
      setError("Simulation only available in development");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!data.riderId) {
        throw new Error("Rider ID not found");
      }

      // Simulate payment verification
      // In production, Razorpay will provide these values
      const result = await verifyPayment.mutateAsync({
        riderId: data.riderId,
        razorpayOrderId,
        razorpayPaymentId: `pay_${Date.now()}`,
        razorpaySignature: "simulated_signature",
      });

      if (result.success) {
        Alert.alert("Payment Successful", "Your onboarding fee has been paid. Waiting for admin approval.", [
          {
            text: "OK",
            onPress: () => {
              router.replace("/(onboarding)/pending");
            },
          },
        ]);
      } else {
        setError("Payment verification failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPayment = async (
    razorpayOrderId: string,
    razorpayPaymentId: string,
    razorpaySignature: string
  ) => {
    setLoading(true);
    setError(null);

    try {
      if (!data.riderId) {
        throw new Error("Rider ID not found");
      }

      const result = await verifyPayment.mutateAsync({
        riderId: data.riderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
      });

      if (result.success) {
        Alert.alert("Payment Successful", "Your onboarding fee has been paid. Waiting for admin approval.", [
          {
            text: "OK",
            onPress: () => {
              router.replace("/(onboarding)/pending");
            },
          },
        ]);
      } else {
        setError("Payment verification failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ marginBottom: 32 }}>
          <Text style={{ fontSize: 30, fontWeight: "bold", color: "#111827", marginBottom: 8 }}>
            Onboarding Fee
          </Text>
          <Text style={{ fontSize: 16, color: "#4B5563" }}>
            Complete your onboarding by paying the registration fee
          </Text>
        </View>

        {/* Payment Details */}
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View
            style={{
              backgroundColor: "#F9FAFB",
              borderRadius: 12,
              padding: 24,
              marginBottom: 24,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 48, fontWeight: "bold", color: colors.primary[500], marginBottom: 8 }}>
              ₹49
            </Text>
            <Text style={{ fontSize: 16, color: "#6B7280", marginBottom: 16 }}>
              One-time onboarding fee
            </Text>
            <View
              style={{
                backgroundColor: "#E0F2FE",
                borderRadius: 8,
                padding: 12,
                width: "100%",
              }}
            >
              <Text style={{ fontSize: 14, color: "#0369A1", textAlign: "center" }}>
                This fee covers document verification and account setup
              </Text>
            </View>
          </View>

          {error && (
            <View
              style={{
                marginBottom: 16,
                padding: 12,
                backgroundColor: "#FEF2F2",
                borderWidth: 1,
                borderColor: "#FECACA",
                borderRadius: 8,
              }}
            >
              <Text style={{ fontSize: 14, color: colors.error[600] }}>{error}</Text>
            </View>
          )}

          <Button
            onPress={handleInitiatePayment}
            loading={loading || createOrder.isPending}
            disabled={loading || createOrder.isPending}
            size="lg"
            style={{ marginBottom: 12 }}
          >
            Pay ₹49
          </Button>

          {orderId && (
            <View
              style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: "#F0FDF4",
                borderWidth: 1,
                borderColor: "#BBF7D0",
                borderRadius: 8,
              }}
            >
              <Text style={{ fontSize: 12, color: "#166534", marginBottom: 4 }}>
                Order ID: {orderId}
              </Text>
              <Text style={{ fontSize: 12, color: "#166534" }}>
                In production, Razorpay checkout will open here
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
