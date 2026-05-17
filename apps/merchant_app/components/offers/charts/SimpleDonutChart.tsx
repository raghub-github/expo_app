import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { GatiMitraMerchant } from "@/constants/theme";

export type DonutSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
  sublabel?: string;
};

type Props = {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  size?: number;
};

function polar(cx: number, cy: number, r: number, angle: number) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, start);
  const large = end - start <= 180 ? 0 : 1;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

export function SimpleDonutChart({ segments, centerLabel, centerValue, size = 120 }: Props) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 14;
  const r = (size - stroke) / 2;

  let angle = 0;
  const arcs =
    total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((seg) => {
            const sweep = (seg.value / total) * 360;
            const start = angle;
            angle += sweep;
            return { ...seg, path: arcPath(cx, cy, r, start, Math.max(start + 0.5, angle)) };
          })
      : [];

  return (
    <View style={styles.row}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={r} stroke="#F1F5F9" strokeWidth={stroke} fill="none" />
          {arcs.map((a) => (
            <Path key={a.key} d={a.path} stroke={a.color} strokeWidth={stroke} fill="none" strokeLinecap="butt" />
          ))}
        </Svg>
        <View style={styles.center} pointerEvents="none">
          <Text style={styles.centerLabel}>{centerLabel}</Text>
          <Text style={styles.centerValue}>{centerValue}</Text>
        </View>
      </View>
      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.key} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <View style={styles.legendTextCol}>
              <View style={styles.legendTop}>
                <Text style={styles.legendLabel}>{s.label}</Text>
                <Text style={styles.legendVal}>{s.value.toLocaleString("en-IN")}</Text>
              </View>
              {s.sublabel ? <Text style={styles.legendSub}>{s.sublabel}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  centerLabel: { fontSize: 10, color: GatiMitraMerchant.textTertiary, textAlign: "center" },
  centerValue: { fontSize: 16, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginTop: 2 },
  legend: { flex: 1, gap: 10, paddingTop: 4 },
  legendRow: { flexDirection: "row", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  legendTextCol: { flex: 1 },
  legendTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  legendLabel: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary, flex: 1 },
  legendVal: { fontSize: 13, fontWeight: "800", color: GatiMitraMerchant.textPrimary },
  legendSub: { fontSize: 11, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
});
