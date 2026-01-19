/**
 * Loading Button Component
 * 
 * A button that shows a loading spinner when processing
 */

import { ButtonHTMLAttributes, ReactNode } from "react";
import { LoadingSpinner } from "./LoadingSpinner";
// Simple cn utility if not available
function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

const variantClasses = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400",
  secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 disabled:bg-gray-100",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-400",
  ghost: "bg-transparent text-gray-700 hover:bg-gray-100 disabled:text-gray-400",
};

const sizeClasses = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-base",
  lg: "px-6 py-3 text-lg",
};

export function LoadingButton({
  loading = false,
  loadingText,
  children,
  variant = "primary",
  size = "md",
  className,
  disabled,
  ...props
}: LoadingButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
        variantClasses[variant],
        sizeClasses[size],
        (disabled || loading) && "cursor-not-allowed opacity-70",
        className
      )}
    >
      {loading && (
        <LoadingSpinner
          variant="button"
          size="sm"
          className="text-current"
        />
      )}
      <span>{loading ? loadingText || "Processing..." : children}</span>
    </button>
  );
}
