import { View } from "react-native";
import { cn } from "@/utils/cn";

type SkeletonProps = { className?: string };

export function Skeleton({ className }: SkeletonProps) {
  return (
    <View className={cn("bg-gray-200 dark:bg-gray-700 rounded", className)} />
  );
}
