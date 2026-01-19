/**
 * Beautiful, Advanced Loading Spinner Component
 * 
 * Multiple variants for different use cases:
 * - Default: Standard spinner
 * - Button: Small spinner for buttons
 * - Page: Full page overlay
 * - Inline: Small inline spinner
 */

// Simple cn utility if not available
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "default" | "button" | "page" | "inline";
  className?: string;
  text?: string;
  fullScreen?: boolean;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

export function LoadingSpinner({
  size = "md",
  variant = "default",
  className,
  text,
  fullScreen = false,
}: LoadingSpinnerProps) {
  // Button variant - minimal spinner
  if (variant === "button") {
    return (
      <svg
        className={cn("animate-spin text-current", sizeClasses[size], className)}
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );
  }

  // Page variant - full screen overlay
  if (variant === "page") {
    return (
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center",
          fullScreen ? "bg-white/90 backdrop-blur-sm" : "bg-transparent",
          className
        )}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            {/* Outer ring */}
            <div
              className={cn(
                "rounded-full border-4 border-gray-200",
                sizeClasses[size]
              )}
            />
            {/* Animated ring */}
            <div
              className={cn(
                "absolute top-0 left-0 rounded-full border-4 border-transparent border-t-blue-600 animate-spin",
                sizeClasses[size]
              )}
              style={{ animationDuration: "0.8s" }}
            />
            {/* Inner dot */}
            <div
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 animate-pulse",
                size === "sm" ? "h-1 w-1" : size === "md" ? "h-2 w-2" : size === "lg" ? "h-3 w-3" : "h-4 w-4"
              )}
            />
          </div>
          {text && (
            <p className="text-sm font-medium text-gray-600 animate-pulse">
              {text}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Inline variant - small inline spinner
  if (variant === "inline") {
    return (
      <div className={cn("inline-flex items-center gap-2", className)}>
        <svg
          className={cn("animate-spin text-blue-600", sizeClasses[size])}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        {text && <span className="text-sm text-gray-600">{text}</span>}
      </div>
    );
  }

  // Default variant - beautiful animated spinner
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="relative">
        {/* Outer rotating ring */}
        <div
          className={cn(
            "rounded-full border-4 border-gray-200",
            sizeClasses[size]
          )}
        />
        {/* Animated gradient ring */}
        <div
          className={cn(
            "absolute top-0 left-0 rounded-full border-4 border-transparent border-t-blue-600 border-r-blue-400 animate-spin",
            sizeClasses[size]
          )}
          style={{ animationDuration: "1s" }}
        />
        {/* Middle ring */}
        <div
          className={cn(
            "absolute top-1/4 left-1/4 rounded-full border-2 border-transparent border-t-blue-500 animate-spin",
            size === "sm" ? "h-2 w-2" : size === "md" ? "h-4 w-4" : size === "lg" ? "h-6 w-6" : "h-8 w-8"
          )}
          style={{ animationDuration: "0.6s", animationDirection: "reverse" }}
        />
        {/* Inner pulsing dot */}
        <div
          className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600 animate-pulse",
            size === "sm" ? "h-1 w-1" : size === "md" ? "h-2 w-2" : size === "lg" ? "h-3 w-3" : "h-4 w-4"
          )}
          style={{ animationDuration: "1.5s" }}
        />
      </div>
      {text && (
        <p className="text-sm font-medium text-gray-600 animate-pulse">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * Loading Overlay Component
 * Shows a loading spinner with optional backdrop
 */
interface LoadingOverlayProps {
  isLoading: boolean;
  text?: string;
  backdrop?: boolean;
  className?: string;
}

export function LoadingOverlay({
  isLoading,
  text,
  backdrop = true,
  className,
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-50 flex items-center justify-center",
        backdrop && "bg-white/80 backdrop-blur-sm",
        className
      )}
    >
      <LoadingSpinner size="lg" text={text} />
    </div>
  );
}
