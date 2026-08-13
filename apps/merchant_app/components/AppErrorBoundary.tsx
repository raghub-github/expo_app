/**
 * Last line of defence for render-phase exceptions.
 * Catches the error, shows a recoverable screen, and keeps auth/orders providers alive.
 */

import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  children: React.ReactNode;
  resetKey?: string | number;
  fallback?: (retry: () => void, error: Error) => React.ReactNode;
  source?: string;
};

type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[merchant-error-boundary:${this.props.source ?? "render"}]`,
      error?.message ?? error,
      info.componentStack
    );
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.retry, error);
    return <AppErrorFallback error={error} retry={this.retry} />;
  }
}

export function AppErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={styles.root}>
      <Ionicons name="warning-outline" size={44} color="#DC2626" />
      <AppText style={styles.title}>Something went wrong</AppText>
      <AppText style={styles.body}>
        This screen ran into a problem. Your orders and session are safe — tap below to try
        again.
      </AppText>
      {__DEV__ ? <AppText style={styles.debug}>{error.message}</AppText> : null}
      <TouchableOpacity style={styles.button} onPress={retry} activeOpacity={0.85}>
        <AppText style={styles.buttonText}>Try again</AppText>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
    backgroundColor: GatiMitraMerchant.background,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  debug: {
    fontSize: 11,
    color: "#DC2626",
    textAlign: "center",
    marginTop: 4,
  },
  button: {
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: GatiMitraMerchant.primary,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
