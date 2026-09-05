import React from "react";
import { RiderActionSlider } from "@/src/components/orders/RiderActionSlider";

type Props = {
  title: string;
  subtitle?: string;
  onComplete: () => void;
  disabled?: boolean;
  loading?: boolean;
  completed?: boolean;
  completedLabel?: string;
};

/** Pickup slide — same shared RiderActionSlider design. */
export function SlideToReachPickup({
  title,
  subtitle,
  onComplete,
  disabled = false,
  loading = false,
  completed = false,
  completedLabel = "Reached pickup ✓",
}: Props) {
  return (
    <RiderActionSlider
      label={subtitle ? `${title}` : title}
      onComplete={onComplete}
      disabled={disabled}
      loading={loading}
      busyLabel={loading ? "Updating..." : null}
      completed={completed}
      completedLabel={completedLabel}
      actionName="reached_pickup"
    />
  );
}
