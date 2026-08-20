import Svg, { Path } from "react-native-svg";

/** Header-to-body wave used on Free Packaging / Deals At inner pages. */
export function DiscoveryWaveDivider({
  width,
  color,
  fromBottom = false,
}: {
  width: number;
  color: string;
  /** Fill the lower half so a dark page can bite into a hero image. */
  fromBottom?: boolean;
}) {
  const h = 22;
  const d = fromBottom
    ? `M0 ${h} H${width} V8 Q${width * 0.875} 0 ${width * 0.75} 12 T${width * 0.5} 10 T${width * 0.25} 12 T0 6 V${h} Z`
    : `M0 0 H${width} V8 Q${width * 0.875} ${h} ${width * 0.75} 10 T${width * 0.5} 12 T${width * 0.25} 10 T0 16 V0 Z`;
  return (
    <Svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} preserveAspectRatio="none">
      <Path d={d} fill={color} />
    </Svg>
  );
}
