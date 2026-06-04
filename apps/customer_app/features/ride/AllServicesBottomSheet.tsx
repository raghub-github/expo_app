/**
 * All Services – bottom sheet wrapper around the shared service grid.
 */

import { useEffect } from "react";
import {
  View,
  Modal,
  ScrollView,
  StyleSheet,
  Dimensions,
  Pressable,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AllServicesGrid, type ServiceId } from "./AllServicesGrid";

export type { ServiceId } from "./AllServicesGrid";
export { ALL_SERVICES } from "./AllServicesGrid";

const { height: WINDOW_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = WINDOW_HEIGHT * 0.88;
const SPRING_CONFIG = { damping: 24, stiffness: 280 };

type AllServicesBottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelectService: (id: ServiceId) => void;
};

export function AllServicesBottomSheet({
  visible,
  onClose,
  onSelectService,
}: AllServicesBottomSheetProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(WINDOW_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withSpring(1);
    } else {
      translateY.value = withSpring(WINDOW_HEIGHT, SPRING_CONFIG);
      backdropOpacity.value = withSpring(0);
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value * 0.45,
  }));

  const handleSelect = (id: ServiceId) => {
    onSelectService(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              height: SHEET_HEIGHT + insets.bottom,
              paddingBottom: insets.bottom + 12,
            },
          ]}
        >
          <Pressable style={styles.handleWrap} onPress={onClose}>
            <View style={styles.handle} />
          </Pressable>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <AllServicesGrid onSelectService={handleSelect} />
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  handleWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
});
