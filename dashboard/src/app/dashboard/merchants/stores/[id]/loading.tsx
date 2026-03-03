import { StoreDashboardSkeleton } from "./StoreDashboardSkeleton";

/** Shown while the store dashboard page chunk/data is loading. Reduces blank screen and ChunkLoadError impact. */
export default function StoreDashboardLoading() {
  return <StoreDashboardSkeleton />;
}
