import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

const PIN_W = 34;
const PIN_H = 42;

const PICKUP_FILL = "#22C55E";
const DROP_FILL = "#EF4444";

/** Teardrop map pin body — tip at bottom center of viewBox. */
const PIN_BODY =
  "M17 41.5C17 41.5 2.5 22.2 2.5 13.5C2.5 6.6 9.1 1 17 1C24.9 1 31.5 6.6 31.5 13.5C31.5 22.2 17 41.5 17 41.5Z";

export const RIDE_MAP_PIN_WIDTH = PIN_W;
export const RIDE_MAP_PIN_HEIGHT = PIN_H;

type Props = {
  variant: "pickup" | "drop";
};

/** Classic map pin — green pickup, red drop (tip anchors on coordinate). */
export function RideMapLocationPin({ variant }: Props) {
  const fill = variant === "pickup" ? PICKUP_FILL : DROP_FILL;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <Svg width={PIN_W} height={PIN_H} viewBox="0 0 34 42">
        <Path d={PIN_BODY} fill={fill} stroke="#FFFFFF" strokeWidth={2} />
        <Circle cx={17} cy={13.5} r={6.25} fill="#FFFFFF" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: PIN_W,
    height: PIN_H,
  },
});
