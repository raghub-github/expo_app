/** Shared empty-state mailbox art for Notifications screens. */
import Svg, { Circle, Ellipse, Path, Rect } from "react-native-svg";

export function NotificationsEmptyMailboxArt({ size = 168 }: { size?: number }) {
  const s = size;
  return (
    <Svg width={s} height={s} viewBox="0 0 160 160" fill="none">
      <Ellipse cx={80} cy={142} rx={36} ry={8} fill="#86EFAC" opacity={0.85} />
      <Path d="M55 138 C60 130 68 132 72 138" stroke="#22C55E" strokeWidth={2} fill="none" />
      <Path d="M88 138 C94 128 102 132 108 140" stroke="#22C55E" strokeWidth={2} fill="none" />
      <Rect x={74} y={88} width={12} height={50} rx={2} fill="#92400E" />
      <Rect x={70} y={134} width={20} height={6} rx={2} fill="#78350F" />
      <Rect x={48} y={58} width={64} height={36} rx={8} fill="#DC2626" />
      <Rect x={52} y={62} width={56} height={28} rx={6} fill="#EF4444" />
      <Path d="M48 72 H112" stroke="#B91C1C" strokeWidth={2} />
      <Circle cx={100} cy={76} r={3} fill="#FCD34D" />
      <Path d="M108 64 L124 58 L108 70 Z" fill="#FBBF24" />
      <Ellipse cx={78} cy={52} rx={18} ry={8} fill="#A16207" />
      <Ellipse cx={78} cy={50} rx={14} ry={5} fill="#CA8A04" />
      <Ellipse cx={70} cy={48} rx={4} ry={5} fill="#7DD3FC" />
      <Ellipse cx={78} cy={46} rx={4} ry={5} fill="#BAE6FD" />
      <Ellipse cx={86} cy={48} rx={4} ry={5} fill="#7DD3FC" />
      <Ellipse cx={98} cy={44} rx={8} ry={6} fill="#FACC15" />
      <Circle cx={103} cy={42} r={2} fill="#0F172A" />
      <Path d="M106 44 L112 44" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" />
      <Path d="M92 46 C88 40 90 36 94 38" fill="#EAB308" />
    </Svg>
  );
}
