"use client";

import { Component, type ReactNode } from "react";

function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "ChunkLoadError" || error.message?.includes("Loading chunk") === true;
  }
  return false;
}

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches ChunkLoadError (and other errors) so failed dynamic chunks don't crash the app.
 * Renders fallback with optional Retry; Retry resets error and remounts children when used with key.
 */
export class ChunkLoadErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (isChunkLoadError(error) || error?.message?.includes("chunk")) {
      console.warn("[ChunkLoadErrorBoundary] Chunk failed to load:", error?.message);
    }
  }

  handleRetry = () => {
    this.setState({ error: null });
    if (this.props.onRetry) this.props.onRetry();
    else if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-screen items-center justify-center bg-amber-50 p-4">
          <div className="rounded-lg border border-amber-200 bg-white p-6 text-center shadow-sm max-w-md">
            <p className="text-amber-800 text-sm font-medium">
              {isChunkLoadError(this.state.error)
                ? "Failed to load the app. Check your connection and try again."
                : this.state.error?.message ?? "Something went wrong."}
            </p>
            <button
              type="button"
              onClick={this.handleRetry}
              className="mt-4 px-4 py-2 text-sm font-medium text-amber-900 bg-amber-200 rounded-lg hover:bg-amber-300"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
