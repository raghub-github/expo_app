import { useEffect } from "react";
import { bootstrapRiderAppAssets } from "@/src/lib/riderAppAssetsDisk";

/** Load rider CMS images; keep last catalog + login hero on disk for offline. */
export function AppAssetsPrefetch() {
  useEffect(() => {
    void bootstrapRiderAppAssets();
  }, []);

  return null;
}
