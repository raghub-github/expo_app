/**
 * Bundled SVG chrome glyphs — paint on the first frame.
 * Vector-icon fonts (@expo/vector-icons) load async and leave empty circles
 * on Home (wallet, bell, tab bar) until the typeface is ready.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

type IconProps = {
  size?: number;
  color?: string;
  focused?: boolean;
};

function IconBox({ size, children }: { size: number; children: ReactNode }) {
  return (
    <View style={{ width: size, height: size }} collapsable={false} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        {children}
      </Svg>
    </View>
  );
}

export function ChromeHomeIcon({ size = 23, color = "#94A3B8", focused = false }: IconProps) {
  return (
    <IconBox size={size}>
      {focused ? (
        <Path
          d="M12 3.2 3.2 11H6v9h4.2v-5.5h3.6V20H18v-9h2.8L12 3.2Z"
          fill={color}
        />
      ) : (
        <Path
          d="M12 4.4 5 10.6V20h4.2v-6h5.6v6H19v-9.4L12 4.4Zm0-1.8 9.5 8.4H19v10H13.8v-6h-3.6v6H5V11H2.5L12 2.6Z"
          fill={color}
        />
      )}
    </IconBox>
  );
}

export function ChromeFoodIcon({ size = 23, color = "#94A3B8", focused = false }: IconProps) {
  return (
    <IconBox size={size}>
      <Path
        d="M12 3.5c-3.4 0-6.2 2.7-6.6 6.1h13.2C18.2 6.2 15.4 3.5 12 3.5Z"
        fill={focused ? color : "none"}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M4 11.2h16v1.8H4V11.2Z" fill={color} />
      <Path
        d="M5.2 14.6h13.6c.6 0 1.1.5 1.1 1.1v1.2H4.1v-1.2c0-.6.5-1.1 1.1-1.1Z"
        fill={focused ? color : "none"}
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </IconBox>
  );
}

export function ChromeOrdersIcon({ size = 23, color = "#94A3B8", focused = false }: IconProps) {
  return (
    <IconBox size={size}>
      <Path
        d="M8.2 3.4h7.6c.5 0 .9.4.9.9v1.4h1.6c.9 0 1.6.7 1.6 1.6v11.4c0 .9-.7 1.6-1.6 1.6H6.7c-.9 0-1.6-.7-1.6-1.6V7.3c0-.9.7-1.6 1.6-1.6h1.6V4.3c0-.5.4-.9.9-.9Z"
        fill={focused ? color : "none"}
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M8.4 4.8h7.2v1H8.4v-1Z" fill={color} />
      <Path d="M8.4 11h7.2v1.5H8.4V11ZM8.4 14.4h5.2v1.5H8.4v-1.5Z" fill={color} />
    </IconBox>
  );
}

export function ChromeProfileIcon({ size = 23, color = "#94A3B8", focused = false }: IconProps) {
  return (
    <IconBox size={size}>
      <Circle cx="12" cy="8" r="3.4" fill={focused ? color : "none"} stroke={color} strokeWidth={1.8} />
      <Path
        d="M5.2 19.2c.6-3.2 3.3-5 6.8-5s6.2 1.8 6.8 5"
        fill={focused ? color : "none"}
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </IconBox>
  );
}

export function ChromeWalletIcon({ size = 18, color = "#111827" }: IconProps) {
  return (
    <IconBox size={size}>
      <Path
        d="M4.2 6.2h13.2c1 0 1.8.8 1.8 1.8v8.2c0 1-.8 1.8-1.8 1.8H4.2c-1 0-1.8-.8-1.8-1.8V8c0-1 .8-1.8 1.8-1.8Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M16.2 12.1h.02" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M3 9.4h16.2" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </IconBox>
  );
}

export function ChromeBellIcon({ size = 18, color = "#111827" }: IconProps) {
  return (
    <IconBox size={size}>
      <Path
        d="M12 4.2c-2.8 0-5 2.2-5 5v3.1l-1.4 2.3c-.2.3 0 .8.4.8h12c.4 0 .6-.5.4-.8L17 12.3V9.2c0-2.8-2.2-5-5-5Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Path d="M10 18.2a2 2 0 0 0 4 0" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </IconBox>
  );
}

export function ChromeLocationIcon({ size = 20, color = "#14B8A6" }: IconProps) {
  return (
    <IconBox size={size}>
      <Path
        d="M12 21s7-6.1 7-11.2A7 7 0 0 0 5 9.8C5 14.9 12 21 12 21Z"
        fill={color}
      />
      <Circle cx="12" cy="9.6" r="2.2" fill="#FFFFFF" />
    </IconBox>
  );
}

export function ChromeChevronDownIcon({ size = 15, color = "#111827" }: IconProps) {
  return (
    <IconBox size={size}>
      <Path
        d="M6 9.2 12 15l6-5.8"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBox>
  );
}

export function ChromeChevronForwardIcon({ size = 14, color = "#9CA3AF" }: IconProps) {
  return (
    <IconBox size={size}>
      <Path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </IconBox>
  );
}
