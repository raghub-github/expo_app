/**
 * Must load before expo-notifications / expo-router so Expo Go SDK 53
 * console.error is not promoted to a red ERROR overlay / crash.
 */
(function installDevLogFilter() {
  if (global.__gatiRiderDevLogFilterInstalled) return;
  global.__gatiRiderDevLogFilterInstalled = true;

  function textOf(args) {
    try {
      return args.map((a) => (typeof a === "string" ? a : String(a ?? ""))).join(" ");
    } catch {
      return "";
    }
  }

  function isBenign(message) {
    return (
      (message.includes("expo-notifications") &&
        (message.includes("Expo Go") ||
          message.includes("SDK 53") ||
          message.includes("development build") ||
          message.includes("remote notifications") ||
          message.includes("Android Push notifications") ||
          message.includes("not fully supported"))) ||
      message.includes("`setPositionAsync` is not supported with edge-to-edge") ||
      message.includes("`setBackgroundColorAsync` is not supported with edge-to-edge") ||
      message.includes("[expo-av]: Expo AV has been deprecated")
    );
  }

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args) => {
    if (isBenign(textOf(args))) return;
    origError(...args);
  };
  console.warn = (...args) => {
    if (isBenign(textOf(args))) return;
    origWarn(...args);
  };
})();
