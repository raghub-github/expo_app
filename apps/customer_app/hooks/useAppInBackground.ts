import { useEffect, useState } from "react";
import { AppState } from "react-native";

/** True while the app is not the foreground activity (JS work should pause). */
export function useAppInBackground(): boolean {
  const [backgrounded, setBackgrounded] = useState(
    () => AppState.currentState !== "active"
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      setBackgrounded(state !== "active");
    });
    return () => sub.remove();
  }, []);

  return backgrounded;
}
