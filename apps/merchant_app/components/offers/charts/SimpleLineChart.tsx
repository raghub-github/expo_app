import { useId } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Path, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import { GatiMitraMerchant } from "@/constants/theme";

export type LineSeries = {
  key: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
  fill?: boolean;
};

type Props = {
  labels: string[];
  series: LineSeries[];
  height?: number;
  formatValue?: (n: number) => string;
};

function buildPath(values: number[], width: number, height: number, max: number): string {
  if (values.length === 0) return "";
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => {
    const x = i * step;
    const y = max <= 0 ? height : height - (v / max) * (height - 8) - 4;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return pts.join(" ");
}

function buildAreaPath(values: number[], width: number, height: number, max: number): string {
  const line = buildPath(values, width, height, max);
  if (!line) return "";
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const lastX = (values.length - 1) * step;
  return `${line} L${lastX.toFixed(1)},${height} L0,${height} Z`;
}

export function SimpleLineChart({ labels, series, height = 160, formatValue }: Props) {
  const gradId = useId().replace(/:/g, "");
  const width = 300;
  const chartH = height - 28;
  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(...allVals, 1) * 1.15;
  const fmt = formatValue ?? ((n: number) => String(Math.round(n)));

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
    v: max * t,
    y: chartH - t * (chartH - 8) - 4,
  }));

  return (
    <View style={styles.wrap}>
      <View style={styles.yAxis}>
        {yTicks.reverse().map((t) => (
          <Text key={t.v} style={styles.yLabel} numberOfLines={1}>
            {fmt(t.v)}
          </Text>
        ))}
      </View>
      <View style={styles.chartCol}>
        <Svg width={width} height={chartH}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={GatiMitraMerchant.primary} stopOpacity="0.35" />
              <Stop offset="1" stopColor={GatiMitraMerchant.primary} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          {yTicks.map((t) => (
            <Line
              key={`g-${t.v}`}
              x1={0}
              y1={t.y}
              x2={width}
              y2={t.y}
              stroke="#E2E8F0"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}
          {series.map((s) => {
            if (s.fill) {
              return (
                <Path
                  key={`${s.key}-area`}
                  d={buildAreaPath(s.values, width, chartH, max)}
                  fill={`url(#${gradId})`}
                />
              );
            }
            return null;
          })}
          {series.map((s) => (
            <Path
              key={s.key}
              d={buildPath(s.values, width, chartH, max)}
              stroke={s.color}
              strokeWidth={s.dashed ? 2 : 2.5}
              fill="none"
              strokeDasharray={s.dashed ? "6 4" : undefined}
            />
          ))}
        </Svg>
        <View style={[styles.xAxis, { width }]}>
          {labels.map((l) => (
            <Text key={l} style={styles.xLabel}>
              {l}
            </Text>
          ))}
        </View>
        <View style={styles.legend}>
          {series.map((s) => (
            <View key={s.key} style={styles.legendItem}>
              <View
                style={[
                  styles.legendLine,
                  { backgroundColor: s.dashed ? "transparent" : s.color, borderColor: s.color },
                  s.dashed && styles.legendDashed,
                ]}
              />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", marginTop: 8 },
  yAxis: { width: 44, justifyContent: "space-between", paddingBottom: 24 },
  yLabel: { fontSize: 9, color: GatiMitraMerchant.textTertiary, textAlign: "right" },
  chartCol: { flex: 1, alignItems: "center" },
  xAxis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  xLabel: { fontSize: 10, color: GatiMitraMerchant.textTertiary },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10, justifyContent: "center" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendLine: { width: 16, height: 3, borderRadius: 2 },
  legendDashed: { height: 0, borderWidth: 1.5, borderStyle: "dashed", width: 16 },
  legendText: { fontSize: 11, color: GatiMitraMerchant.textSecondary },
});
