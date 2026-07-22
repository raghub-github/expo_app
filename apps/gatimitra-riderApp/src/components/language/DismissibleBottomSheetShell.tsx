import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  Keyboard,
  KeyboardAvoidingView,
  useWindowDimensions,
  type KeyboardEvent,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  KEYBOARD_CLEARANCE,
  keyboardSheetLayoutForEmbeddedAndroid,
  keyboardSheetLayoutFromEvent,
  legacySheetKeyboardLift,
  legacySheetMaxHeight,
  resolveEmbeddedSheetBottomLift,
  type KeyboardSheetLayout,
} from "@/src/hooks/useKeyboardBottomInset";
import {
  useNavScreenBottomInset,
  useRiderBottomInset,
} from "@/src/hooks/useRiderBottomInset";

const WINDOW_RESIZE_THRESHOLD = 48;

type DismissibleBottomSheetShellProps = {
  visible: boolean;
  onDismiss: () => void;
  children: React.ReactNode;
  maxHeightRatio?: number;
  minHeightRatio?: number;
  sheetStyle?: ViewStyle;
  showOuterHandle?: boolean;
  bottomOffset?: number;
  sheetBottomPadding?: number;
  keyboardAware?: boolean;
  /** In-screen overlay (no Modal) — works with Android adjustResize. */
  embedded?: boolean;
  /** Extends embedded sheet down over the tab bar (keyboard closed). */
  embeddedBottomExtend?: number;
  fitContent?: boolean;
  compactBottomInset?: boolean;
};

type SheetKeyboardContextValue = {
  keyboardOpen: boolean;
  availableHeight: number | null;
};

const SheetKeyboardContext = createContext<SheetKeyboardContextValue>({
  keyboardOpen: false,
  availableHeight: null,
});

export function useSheetKeyboardState(): SheetKeyboardContextValue {
  return useContext(SheetKeyboardContext);
}

export function DismissibleBottomSheetShell({
  visible,
  onDismiss,
  children,
  maxHeightRatio = 0.88,
  minHeightRatio,
  sheetStyle,
  showOuterHandle = true,
  bottomOffset = 0,
  sheetBottomPadding,
  keyboardAware = false,
  embedded = false,
  embeddedBottomExtend = 0,
  fitContent = false,
  compactBottomInset = false,
}: DismissibleBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
  const tabBarBottom = useRiderBottomInset();
  const navScreenBottom = useNavScreenBottomInset();
  const systemBottom = compactBottomInset ? navScreenBottom : tabBarBottom;
  const { height: winH } = useWindowDimensions();
  const useLegacyKeyboard = keyboardAware && !embedded && !fitContent;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const legacyKeyboardEventRef = useRef<KeyboardEvent | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [keyboardLayout, setKeyboardLayout] = useState<KeyboardSheetLayout | null>(null);
  const hideKeyboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyboardEventRef = useRef<KeyboardEvent | null>(null);
  const baselineWinHRef = useRef(0);
  const prevVisibleRef = useRef(false);

  useLayoutEffect(() => {
    if (visible && !prevVisibleRef.current) {
      baselineWinHRef.current = winH;
    }
    prevVisibleRef.current = visible;
  }, [visible, winH]);

  useEffect(() => {
    if (!keyboardAware || !visible) {
      if (hideKeyboardTimerRef.current) {
        clearTimeout(hideKeyboardTimerRef.current);
        hideKeyboardTimerRef.current = null;
      }
      setKeyboardHeight(0);
      legacyKeyboardEventRef.current = null;
      setKeyboardOpen(false);
      setKeyboardLayout(null);
      return;
    }

    if (useLegacyKeyboard) {
      const onShow = (event: KeyboardEvent) => {
        legacyKeyboardEventRef.current = event;
        setKeyboardHeight(event.endCoordinates.height);
      };
      const onHide = () => {
        legacyKeyboardEventRef.current = null;
        setKeyboardHeight(0);
      };
      const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
      const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
      const showSub = Keyboard.addListener(showEvent, onShow);
      const hideSub = Keyboard.addListener(hideEvent, onHide);
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }

    const layoutMode = embedded ? "embedded" : "modal";

    const applyKeyboardLayout = (event: KeyboardEvent) => {
      setKeyboardLayout(keyboardSheetLayoutFromEvent(event, insets.top, layoutMode));
    };

    const onShow = (event: KeyboardEvent) => {
      if (hideKeyboardTimerRef.current) {
        clearTimeout(hideKeyboardTimerRef.current);
        hideKeyboardTimerRef.current = null;
      }
      lastKeyboardEventRef.current = event;

      if (embedded && Platform.OS === "android" && keyboardAware) {
        setKeyboardOpen(true);
        const applyEmbeddedLayout = () => {
          setKeyboardLayout(keyboardSheetLayoutForEmbeddedAndroid(insets.top, event));
        };
        applyEmbeddedLayout();
        requestAnimationFrame(() => {
          requestAnimationFrame(applyEmbeddedLayout);
        });
        setTimeout(applyEmbeddedLayout, 80);
        setTimeout(applyEmbeddedLayout, 160);
        return;
      }

      setKeyboardOpen(true);
      if (embedded && Platform.OS === "android") {
        const applyEmbeddedLayout = () => {
          setKeyboardLayout(keyboardSheetLayoutForEmbeddedAndroid(insets.top, event));
        };
        requestAnimationFrame(() => {
          requestAnimationFrame(applyEmbeddedLayout);
        });
        setTimeout(applyEmbeddedLayout, 80);
        setTimeout(applyEmbeddedLayout, 160);
        return;
      }
      applyKeyboardLayout(event);
    };
    const onHide = () => {
      if (embedded && Platform.OS === "android" && keyboardAware) {
        if (hideKeyboardTimerRef.current) {
          clearTimeout(hideKeyboardTimerRef.current);
        }
        hideKeyboardTimerRef.current = setTimeout(() => {
          hideKeyboardTimerRef.current = null;
          lastKeyboardEventRef.current = null;
          setKeyboardOpen(false);
          setKeyboardLayout(null);
        }, 120);
        return;
      }
      if (embedded && Platform.OS === "android") {
        if (hideKeyboardTimerRef.current) {
          clearTimeout(hideKeyboardTimerRef.current);
        }
        hideKeyboardTimerRef.current = setTimeout(() => {
          hideKeyboardTimerRef.current = null;
          lastKeyboardEventRef.current = null;
          setKeyboardOpen(false);
          setKeyboardLayout(null);
        }, 150);
        return;
      }
      lastKeyboardEventRef.current = null;
      setKeyboardOpen(false);
      setKeyboardLayout(null);
    };

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
      if (hideKeyboardTimerRef.current) {
        clearTimeout(hideKeyboardTimerRef.current);
        hideKeyboardTimerRef.current = null;
      }
    };
  }, [keyboardAware, visible, insets.top, embedded, useLegacyKeyboard]);

  useEffect(() => {
    if (useLegacyKeyboard || !keyboardAware || !visible || !keyboardOpen) return;
    const event = lastKeyboardEventRef.current;
    if (!event) return;
    if (embedded && Platform.OS === "android") {
      setKeyboardLayout(keyboardSheetLayoutForEmbeddedAndroid(insets.top, event));
      return;
    }
    setKeyboardLayout(keyboardSheetLayoutFromEvent(event, insets.top, embedded ? "embedded" : "modal"));
  }, [keyboardAware, visible, embedded, keyboardOpen, winH, insets.top, useLegacyKeyboard]);

  const ratioMaxH = Math.round(winH * maxHeightRatio);
  const androidEmbeddedResize = embedded && Platform.OS === "android" && keyboardAware;
  // The app is configured with android:windowSoftInputMode="adjustResize" AND
  // softwareKeyboardLayoutMode="resize", so the window is GUARANTEED to shrink by
  // the keyboard height. For an embedded flex-end overlay that means the sheet
  // already sits flush on the keyboard with zero manual lift, so "keyboard open" ⇒
  // "window resized" here — which collapses sheetBottom to 0.
  //
  // The old mount-time baseline delta was unreliable: with autoFocus the keyboard
  // opens as the sheet mounts, so baseline was captured post-resize (delta ≈ 0),
  // and the code then added a full keyboard-height lift ON TOP of the already-
  // resized window — the persistent gap in the OTP sheet. Trusting the guaranteed
  // resize removes both the gap and the re-layout flicker.
  const windowResizedForKeyboard = androidEmbeddedResize && keyboardOpen;

  if (useLegacyKeyboard) {
    const legacyEvent = legacyKeyboardEventRef.current;
    const legacyKeyboardOpen = keyboardHeight > 0 && legacyEvent != null;
    const maxH = legacyKeyboardOpen
      ? Math.min(legacySheetMaxHeight(legacyEvent, insets.top), winH - insets.top - 8)
      : ratioMaxH;
    const minH = minHeightRatio != null ? Math.round(winH * minHeightRatio) : undefined;
    const innerPad = legacyKeyboardOpen
      ? 8
      : sheetBottomPadding ?? (bottomOffset > 0 ? bottomOffset : systemBottom);
    const keyboardLift =
      legacyKeyboardOpen && legacyEvent
        ? legacySheetKeyboardLift(legacyEvent, winH)
        : 0;

    const legacySheetNode = (
      <View style={styles.legacyRoot}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Close" />
        <View
          style={[
            styles.legacyAnchor,
            {
              maxHeight: maxH,
              minHeight: minH,
              marginBottom: keyboardLift,
              paddingBottom: legacyKeyboardOpen ? 0 : undefined,
            },
          ]}
        >
          {showOuterHandle ? <View style={styles.handle} /> : null}
          <View
            style={[
              styles.sheet,
              styles.legacySheetKeyboard,
              { maxHeight: maxH, paddingBottom: innerPad },
              sheetStyle,
            ]}
          >
            {children}
          </View>
        </View>
      </View>
    );

    if (embedded) {
      if (!visible) return null;
      return legacySheetNode;
    }

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={onDismiss}
      >
        <KeyboardAvoidingView
          style={styles.keyboardRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={Platform.OS === "ios"}
          keyboardVerticalOffset={insets.top}
        >
          {legacySheetNode}
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  const keyboardActive = keyboardOpen && (androidEmbeddedResize || keyboardLayout != null);
  const useFitContent = fitContent;
  const sheetBottom = (() => {
    if (!keyboardActive) return 0;
    if (androidEmbeddedResize) {
      if (windowResizedForKeyboard) return 0;
      if (keyboardLayout && lastKeyboardEventRef.current) {
        return resolveEmbeddedSheetBottomLift(
          keyboardLayout,
          lastKeyboardEventRef.current,
          winH,
          baselineWinHRef.current
        );
      }
      if (lastKeyboardEventRef.current) {
        const lift = legacySheetKeyboardLift(lastKeyboardEventRef.current, winH);
        if (lift > 0) return lift;
        const keyboardH = Math.round(lastKeyboardEventRef.current.endCoordinates.height);
        if (keyboardH > 100) return keyboardH + KEYBOARD_CLEARANCE;
      }
      return 0;
    }
    if (!keyboardLayout) return 0;
    if (
      embedded &&
      Platform.OS === "android" &&
      baselineWinHRef.current > 0 &&
      baselineWinHRef.current - winH >= WINDOW_RESIZE_THRESHOLD
    ) {
      return 0;
    }
    if (embedded && Platform.OS === "android") {
      return resolveEmbeddedSheetBottomLift(
        keyboardLayout,
        lastKeyboardEventRef.current,
        winH,
        baselineWinHRef.current
      );
    }
    return keyboardLayout.bottomLift;
  })();
  const maxH = (() => {
    if (!keyboardActive) return ratioMaxH;
    if (androidEmbeddedResize) {
      if (windowResizedForKeyboard) {
        return Math.max(220, Math.round(winH - 8));
      }
      if (sheetBottom > 0 && lastKeyboardEventRef.current) {
        return legacySheetMaxHeight(lastKeyboardEventRef.current, insets.top);
      }
      if (lastKeyboardEventRef.current) {
        const keyboardTop = Math.round(lastKeyboardEventRef.current.endCoordinates.screenY);
        if (keyboardTop < winH - 8) {
          return Math.max(200, Math.round(keyboardTop - insets.top - KEYBOARD_CLEARANCE - 4));
        }
      }
      return Math.max(220, Math.round(winH - 8));
    }
    if (!keyboardLayout) return ratioMaxH;
    if (
      embedded &&
      Platform.OS === "android" &&
      baselineWinHRef.current > 0 &&
      baselineWinHRef.current - winH >= 48
    ) {
      return Math.max(220, Math.round(winH - 8));
    }
    if (sheetBottom > 0 && lastKeyboardEventRef.current) {
      return legacySheetMaxHeight(lastKeyboardEventRef.current, insets.top);
    }
    return keyboardLayout.availableHeight;
  })();
  const minH =
    keyboardActive || minHeightRatio == null || useFitContent
      ? undefined
      : Math.round(winH * minHeightRatio);
  const innerPad = keyboardActive
    ? 8
    : sheetBottomPadding ?? (bottomOffset > 0 ? bottomOffset : systemBottom);
  const bottomExtend =
    embedded && !keyboardActive ? Math.max(0, embeddedBottomExtend) : 0;
  const anchorBottom = sheetBottom - bottomExtend;
  const pinSheetAboveKeyboard =
    keyboardActive && useFitContent && sheetBottom > 0 && !windowResizedForKeyboard;

  const keyboardContextValue = {
    keyboardOpen: keyboardActive,
    availableHeight: keyboardActive ? maxH : null,
  };

  const sheetNode = (
    <View
      style={[
        styles.root,
        embedded && styles.rootEmbedded,
        pinSheetAboveKeyboard && styles.rootKeyboardEnd,
        pinSheetAboveKeyboard && sheetBottom > 0 && { paddingBottom: sheetBottom },
      ]}
    >
      <Pressable
        style={[styles.backdrop, keyboardActive && styles.backdropKeyboard]}
        onPress={onDismiss}
        accessibilityLabel="Close"
      />
      <View
        style={[
          pinSheetAboveKeyboard ? styles.anchorPinnedFlow : styles.anchor,
          pinSheetAboveKeyboard
            ? null
            : {
                maxHeight: maxH,
                minHeight: minH,
                bottom: anchorBottom,
              },
          androidEmbeddedResize && styles.anchorEmbeddedResize,
          useFitContent && !pinSheetAboveKeyboard && styles.anchorFitContent,
        ]}
      >
        {showOuterHandle && !pinSheetAboveKeyboard ? <View style={styles.handle} /> : null}
        <View
          style={[
            styles.sheet,
            useFitContent && styles.sheetFitContent,
            pinSheetAboveKeyboard && styles.sheetKeyboardPin,
            keyboardActive && !pinSheetAboveKeyboard && styles.sheetKeyboardOpen,
            pinSheetAboveKeyboard
              ? { paddingBottom: innerPad, maxHeight: maxH }
              : androidEmbeddedResize
                ? { paddingBottom: innerPad }
                : { maxHeight: maxH, minHeight: minH, paddingBottom: innerPad },
            sheetStyle,
          ]}
        >
          <SheetKeyboardContext.Provider value={keyboardContextValue}>
            <View
              style={[
                styles.contentSlot,
                !keyboardActive && minH != null && !useFitContent && styles.contentSlotStretch,
              ]}
            >
              {children}
            </View>
          </SheetKeyboardContext.Provider>
        </View>
      </View>
    </View>
  );

  if (embedded) {
    if (!visible) return null;
    return sheetNode;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      {sheetNode}
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
  },
  legacyRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  legacyAnchor: {
    width: "100%",
    flexShrink: 0,
  },
  legacySheetKeyboard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  root: {
    flex: 1,
  },
  rootEmbedded: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    elevation: 3000,
    overflow: "visible",
    justifyContent: "flex-end",
  },
  rootKeyboardEnd: {
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  backdropKeyboard: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
  },
  anchor: {
    position: "absolute",
    left: 0,
    right: 0,
    width: "100%",
    flexShrink: 0,
  },
  anchorFitContent: {
    flexShrink: 1,
  },
  anchorKeyboardPin: {
    left: 0,
    right: 0,
    width: "100%",
    flexShrink: 0,
  },
  anchorPinnedFlow: {
    width: "100%",
    flexShrink: 0,
  },
  anchorEmbeddedResize: {
    bottom: 0,
    left: 0,
    right: 0,
  },
  contentSlot: {
    width: "100%",
    minHeight: 0,
    flexShrink: 1,
  },
  contentSlotStretch: {
    flex: 1,
    flexGrow: 1,
    flexDirection: "column",
    minHeight: 0,
  },
  sheetFitContent: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetKeyboardOpen: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  sheetKeyboardPin: {
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255, 255, 255, 0.85)",
    marginBottom: 8,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    ...(Platform.OS === "android"
      ? { elevation: 16 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
        }),
  },
});

export function useBottomSheetViewport(
  maxHeightRatio: number,
  options?: {
    compactBottomInset?: boolean;
    includeHandle?: boolean;
    sheetBottomPadding?: number;
    keyboardAvailableHeight?: number;
  }
) {
  const { height: winH } = useWindowDimensions();
  const tabBarBottom = useRiderBottomInset();
  const navScreenBottom = useNavScreenBottomInset();
  const bottomPad = options?.compactBottomInset ? navScreenBottom : tabBarBottom;
  const includeHandle = options?.includeHandle ?? true;
  const handleH = includeHandle ? 13 : 0;
  const sheetPad = options?.sheetBottomPadding ?? 0;
  const keyboardAvailableHeight = options?.keyboardAvailableHeight;
  const keyboardOpen = keyboardAvailableHeight != null && keyboardAvailableHeight > 0;
  const maxSheetH = keyboardOpen
    ? keyboardAvailableHeight
    : Math.round(winH * maxHeightRatio);
  const scrollMaxH = Math.max(
    160,
    maxSheetH - handleH - (keyboardOpen ? sheetPad : bottomPad + sheetPad),
  );

  return { maxSheetH, scrollMaxH, bottomPad, handleH, keyboardOpen };
}
