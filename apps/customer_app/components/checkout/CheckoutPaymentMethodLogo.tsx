import type { ReactElement, ReactNode } from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Path, Rect, Text as SvgText, SvgXml } from "react-native-svg";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import {
  AMAZON_SVG,
  PAYPAL_SVG,
  PAYTM_SVG,
  PHONEPE_SVG,
  WHATSAPP_SVG,
} from "@/components/checkout/paymentBrandSvg";

type LogoProps = { size: number };

function LogoSlot({
  size,
  children,
}: {
  size: number;
  children: ReactNode;
}) {
  return (
    <View style={[styles.slot, { width: size, height: size }]}>
      {children}
    </View>
  );
}

function BrandXml({ xml, size, inset = 0.16 }: { xml: string; size: number; inset?: number }) {
  const inner = Math.max(16, Math.round(size * (1 - inset)));
  return <SvgXml xml={xml} width={inner} height={inner} style={styles.svg} />;
}

/** Google's 4-color G — the mark Zomato uses for Google Pay. */
function GoogleG({ size }: LogoProps) {
  const s = Math.round(size * 0.78);
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <Path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </Svg>
  );
}

function UpiMark({ size }: LogoProps) {
  const s = Math.round(size * 0.92);
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      <Rect x="4" y="8" width="40" height="32" rx="6" fill="#FFFFFF" />
      <Path fill="#FF9933" d="M10 8h28a6 6 0 016 6v2H4v-2a6 6 0 016-6z" />
      <Path fill="#138808" d="M4 32h40v2a6 6 0 01-6 6H10a6 6 0 01-6-6v-2z" />
      <SvgText x="24" y="29" textAnchor="middle" fontSize="11" fontWeight="800" fill="#0B3C8A">
        UPI
      </SvgText>
    </Svg>
  );
}

function BhimMark({ size }: LogoProps) {
  const s = Math.round(size * 0.92);
  return (
    <Svg width={s} height={s} viewBox="0 0 48 48">
      <Rect x="2" y="2" width="44" height="44" rx="10" fill="#F47721" />
      <SvgText x="24" y="22" textAnchor="middle" fontSize="8" fontWeight="700" fill="#FFFFFF">
        BHIM
      </SvgText>
      <Path fill="#FFFFFF" d="M12 28h24v2H12z" />
      <Path fill="#FF9933" d="M12 31h8v2h-8z" />
      <Path fill="#FFFFFF" d="M20 31h8v2h-8z" />
      <Path fill="#138808" d="M28 31h8v2h-8z" />
    </Svg>
  );
}

const MARK: Record<string, (p: LogoProps) => ReactElement> = {
  google_pay: (p) => (
    <LogoSlot size={p.size}>
      <GoogleG size={p.size} />
    </LogoSlot>
  ),
  phonepe: (p) => (
    <LogoSlot size={p.size}>
      <BrandXml xml={PHONEPE_SVG} size={p.size} inset={0.04} />
    </LogoSlot>
  ),
  paytm: (p) => (
    <LogoSlot size={p.size}>
      <BrandXml xml={PAYTM_SVG} size={p.size} inset={0.12} />
    </LogoSlot>
  ),
  bhim: (p) => (
    <LogoSlot size={p.size}>
      <BhimMark size={p.size} />
    </LogoSlot>
  ),
  upi: (p) => (
    <LogoSlot size={p.size}>
      <UpiMark size={p.size} />
    </LogoSlot>
  ),
  amazonpay: (p) => (
    <LogoSlot size={p.size}>
      <BrandXml xml={AMAZON_SVG} size={p.size} inset={0.18} />
    </LogoSlot>
  ),
  whatsapp: (p) => (
    <LogoSlot size={p.size}>
      <BrandXml xml={WHATSAPP_SVG} size={p.size} inset={0.12} />
    </LogoSlot>
  ),
  cred: (p) => (
    <LogoSlot size={p.size}>
      <Svg width={p.size} height={p.size} viewBox="0 0 48 48">
        <SvgText x="24" y="29" textAnchor="middle" fontSize="9" fontWeight="800" fill="#111111">
          CRED
        </SvgText>
      </Svg>
    </LogoSlot>
  ),
  mobikwik: (p) => (
    <LogoSlot size={p.size}>
      <Svg width={p.size} height={p.size} viewBox="0 0 48 48">
        <SvgText x="24" y="30" textAnchor="middle" fontSize="16" fontWeight="800" fill="#00B386">
          M
        </SvgText>
      </Svg>
    </LogoSlot>
  ),
  airtel: (p) => (
    <LogoSlot size={p.size}>
      <Svg width={Math.round(p.size * 0.78)} height={Math.round(p.size * 0.78)} viewBox="0 0 48 48">
        <Path
          fill="#ED1C24"
          d="M24 8c8.4 7.4 12.2 14.6 12.2 21.2 0 5.8-3.9 9.6-9.5 9.6-3 0-5.5-1.2-7.2-3.2 4.2.5 7.6-1.2 7.6-4.8 0-5.5-6.5-9.6-14.1-14.2C17.2 12.2 21 9.4 24 8z"
        />
      </Svg>
    </LogoSlot>
  ),
  paypal: (p) => (
    <LogoSlot size={p.size}>
      <BrandXml xml={PAYPAL_SVG} size={p.size} inset={0.18} />
    </LogoSlot>
  ),
  payzapp: (p) => (
    <LogoSlot size={p.size}>
      <Svg width={p.size} height={p.size} viewBox="0 0 48 48">
        <SvgText x="24" y="29" textAnchor="middle" fontSize="8" fontWeight="800" fill="#ED1C24">
          PayZapp
        </SvgText>
      </Svg>
    </LogoSlot>
  ),
  card: (p) => (
    <LogoSlot size={p.size}>
      <Ionicons name="card-outline" size={Math.round(p.size * 0.62)} color="#374151" />
    </LogoSlot>
  ),
  netbanking: (p) => (
    <LogoSlot size={p.size}>
      <MaterialCommunityIcons name="bank-outline" size={Math.round(p.size * 0.6)} color="#1E3A5F" />
    </LogoSlot>
  ),
  wallet: (p) => (
    <LogoSlot size={p.size}>
      <Ionicons name="wallet-outline" size={Math.round(p.size * 0.6)} color="#334155" />
    </LogoSlot>
  ),
};

export function CheckoutPaymentMethodLogo({ logoKey, size = 36 }: { logoKey: string; size?: number }) {
  const render = MARK[logoKey] ?? MARK.wallet;
  return render({ size });
}

const styles = StyleSheet.create({
  slot: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    backgroundColor: "transparent",
    borderWidth: 0,
    overflow: "visible",
    elevation: 0,
    shadowOpacity: 0,
    shadowColor: "transparent",
  },
  svg: {
    backgroundColor: "transparent",
  },
});
