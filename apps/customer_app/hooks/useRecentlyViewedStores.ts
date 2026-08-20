import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  readRecentlyViewedStores,
  type RecentlyViewedStore,
} from "@/lib/recentlyViewedStores";

export function useRecentlyViewedStores() {
  const [stores, setStores] = useState<RecentlyViewedStore[]>([]);

  const refresh = useCallback(async () => {
    setStores(await readRecentlyViewedStores());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  return { stores, refresh };
}
