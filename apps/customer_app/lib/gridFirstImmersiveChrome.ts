import { useScreenChromeStore } from "@/store/screenChromeStore";

/** Grid-first food home — hero draws under the status bar (no white spacer jump). */
export function applyGridFirstImmersiveChrome(active: boolean): void {
  const store = useScreenChromeStore.getState();
  if (active) {
    store.setImmersiveStatusBarChrome(true);
    store.setStatusBarBackground("transparent", "dark");
  } else {
    store.setImmersiveStatusBarChrome(false);
  }
}
