/**
 * Last line of defence for render-phase exceptions.
 *
 * Without a boundary, a throw anywhere in the tree unmounts the whole app —
 * which in a release build means the process exits with no dialog. This catches
 * it, reports it, and shows a recoverable screen so the user can retry instead
 * of losing their session.
 *
 * `resetKey` lets a caller (e.g. the router's current route) clear the error
 * automatically on navigation, so a screen that failed once does not stay stuck.
 */

import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";
import { reportHandledError } from "@/lib/crashReporting";

type Props = {
  children: React.ReactNode;
  /** Changing this value clears a caught error (e.g. on route change). */
  resetKey?: string | number;
  /** Rendered instead of the default screen; receives a retry callback. */
  fallback?: (retry: () => void, error: Error) => React.ReactNode;
  /** Label used in crash breadcrumbs to identify which subtree failed. */
  source?: string;
};

type State = { error: Error | null };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportHandledError(this.props.source ?? "render", error);
    if (__DEV__) console.error("[error-boundary] componentStack:", info.componentStack);
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

/** Shared recovery screen — also used for Expo Router's own route errors. */
export function AppErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={styles.root}>
      <Ionicons name="warning-outline" size={44} color={GatiMitraColors.errorRed} />
      <AppText style={styles.title}>Something went wrong</AppText>
      <AppText style={styles.body}>
        This screen ran into a problem. Your cart and orders are safe — tap below to try again.
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
    backgroundColor: GatiMitraColors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: GatiMitraColors.textPrimary,
    textAlign: "center",
  },
  body: {
    fontSize: 14,
    color: GatiMitraColors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  debug: {
    fontSize: 11,
    color: GatiMitraColors.errorRed,
    textAlign: "center",
    marginTop: 4,
  },
  button: {
    marginTop: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    backgroundColor: GatiMitraColors.primaryMint,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
