import React from "react";
import {
  decideOverlayRemount,
  OVERLAY_FAILURE_FORGET_MS,
} from "@/src/lib/overlayRemountPolicy";
import { riderDispatchWarn } from "@/src/lib/rider-dispatch-log";

type Props = {
  /** Name used in logs so a crash can be traced to one overlay. */
  name: string;
  children: React.ReactNode;
};

type State = {
  crashed: boolean;
  failureCount: number;
  lastFailureAt: number | null;
};

/**
 * Keeps one misbehaving global overlay from taking the whole app down.
 *
 * The rider app mounts its order alert and sheets beside the router <Stack> in
 * the root layout, outside every route error boundary, so a single render throw
 * there was a full app crash — most visibly when a malformed dispatch offer
 * arrived and the incoming-order card tried to render it.
 *
 * A caught overlay is dropped, logged, and then remounted after a cool-off (see
 * overlayRemountPolicy) so a transient bad payload does not leave the rider
 * permanently blind to new orders.
 */
export class OverlayErrorBoundary extends React.Component<Props, State> {
  private timer: ReturnType<typeof setTimeout> | null = null;

  state: State = { crashed: false, failureCount: 0, lastFailureAt: null };

  static getDerivedStateFromError(): Partial<State> {
    return { crashed: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    const now = Date.now();
    const msSincePreviousFailure =
      this.state.lastFailureAt == null ? null : now - this.state.lastFailureAt;
    const failureCount =
      msSincePreviousFailure != null && msSincePreviousFailure > OVERLAY_FAILURE_FORGET_MS
        ? 1
        : this.state.failureCount + 1;

    riderDispatchWarn("overlay crashed", {
      overlay: this.props.name,
      failureCount,
      message: error instanceof Error ? error.message : String(error),
      stack:
        error instanceof Error && typeof error.stack === "string"
          ? error.stack.split("\n").slice(0, 6).join("\n")
          : undefined,
      componentStack:
        info && typeof info === "object" && "componentStack" in info
          ? String((info as { componentStack?: unknown }).componentStack ?? "")
              .split("\n")
              .slice(0, 6)
              .join("\n")
          : undefined,
    });

    this.setState({ failureCount, lastFailureAt: now });

    const decision = decideOverlayRemount({ failureCount, msSincePreviousFailure });
    if (!decision.remount) {
      riderDispatchWarn("overlay stays down", {
        overlay: this.props.name,
        reason: decision.reason,
      });
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.setState({ crashed: false });
    }, decision.delayMs);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    if (this.state.crashed) return null;
    return this.props.children;
  }
}

/** Wrap a global overlay so its crashes stay local to it. */
export function guardOverlay(name: string, node: React.ReactNode) {
  return <OverlayErrorBoundary name={name}>{node}</OverlayErrorBoundary>;
}
