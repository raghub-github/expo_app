/**
 * Holds the React Native Text host for AppText.
 * RN.Text is getter-only on New Architecture — we never replace it.
 */
import type { ComponentType } from "react";

type TextComponent = ComponentType<Record<string, unknown>>;

let host: TextComponent | null = null;

export function setTextHost(component: TextComponent): void {
  host = component;
}

export function getTextHost(): TextComponent {
  if (host) return host;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RN = require("react-native") as { Text: TextComponent };
  host = RN.Text;
  return host;
}
