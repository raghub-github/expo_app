/**

 * Branded footer banner — reference: mint bg, bokeh bubbles, sparkles, swoosh underline, gm art.

 */



import { View, Text, StyleSheet, Dimensions } from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";



const { width: SCREEN_W } = Dimensions.get("window");

const PAD = 16;

const BANNER_W = SCREEN_W - PAD * 2;



const GATI_GREEN = "#22C55E";

const SWOOSH_GREEN = "#16A34A";

const TAGLINE_GREEN = "#166534";

const MITRA_DARK = "#0F172A";

const BG_GRADIENT = ["#E8F5F1", "#F3FBF8", "#E8F5F1"] as const;



function BokehBubble({

  size,

  color,

  style,

}: {

  size: number;

  color: string;

  style: object;

}) {

  return (

    <View

      pointerEvents="none"

      style={[

        {

          position: "absolute",

          width: size,

          height: size,

          borderRadius: size / 2,

          backgroundColor: color,

        },

        style,

      ]}

    />

  );

}



function DecoDiamond({

  size,

  color,

  style,

}: {

  size: number;

  color: string;

  style: object;

}) {

  return (

    <View

      pointerEvents="none"

      style={[

        {

          position: "absolute",

          width: size,

          height: size,

          backgroundColor: color,

          transform: [{ rotate: "45deg" }],

          borderRadius: 1,

        },

        style,

      ]}

    />

  );

}



type Props = {

  bannerHeight?: number;

};



const DEFAULT_BANNER_H = 108;



export function HomeBrandBanner({ bannerHeight = DEFAULT_BANNER_H }: Props) {

  const artH = Math.round(bannerHeight * 0.92);

  const artW = Math.round(bannerHeight * 1.18);

  const swooshW = Math.min(128, Math.round(BANNER_W * 0.36));



  return (

    <View style={styles.wrap}>

      <LinearGradient

        colors={[...BG_GRADIENT]}

        start={{ x: 0, y: 0.5 }}

        end={{ x: 1, y: 0.5 }}

        style={[styles.banner, { height: bannerHeight }]}

      >

        {/* Large bokeh bubbles */}

        <BokehBubble size={72} color="rgba(255,255,255,0.52)" style={styles.bubbleA} />

        <BokehBubble size={56} color="rgba(167,243,208,0.38)" style={styles.bubbleB} />

        <BokehBubble size={44} color="rgba(255,255,255,0.4)" style={styles.bubbleC} />

        <BokehBubble size={38} color="rgba(204,251,241,0.45)" style={styles.bubbleD} />



        {/* Small diamond accents */}

        <DecoDiamond size={7} color="rgba(125,211,252,0.55)" style={styles.diamondA} />

        <DecoDiamond size={6} color="rgba(253,224,71,0.6)" style={styles.diamondB} />

        <DecoDiamond size={5} color="rgba(125,211,252,0.45)" style={styles.diamondC} />

        <DecoDiamond size={6} color="rgba(253,224,71,0.5)" style={styles.diamondD} />

        <DecoDiamond size={5} color="rgba(167,243,208,0.7)" style={styles.diamondE} />



        <Text style={styles.sparkFloatA} pointerEvents="none">

          ✦

        </Text>

        <Text style={styles.sparkFloatB} pointerEvents="none">

          ✨

        </Text>



        <View style={styles.textCol}>

          <Text style={styles.tagline} numberOfLines={1}>

            <Text style={styles.sparkleEmoji}>✨ </Text>

            Made for your moments

            <Text style={styles.sparkleEmoji}> ✨</Text>

          </Text>



          <View style={styles.brandBlock}>

            <View style={styles.brandRow}>

              <Text style={styles.gati}>Gati</Text>

              <Text style={styles.mitra}>Mitra</Text>

            </View>

            <View style={[styles.swooshClip, { width: swooshW }]}>

              <View style={[styles.swooshArc, { width: swooshW }]} />

            </View>

          </View>

        </View>



        <View style={[styles.artWrap, { height: bannerHeight, width: artW }]}>

          <AppAssetImage
            assetKey={CX.home.brandBanner}
            style={{ width: artW, height: artH }}
            contentFit="contain"
          />

        </View>

      </LinearGradient>

    </View>

  );

}



const styles = StyleSheet.create({

  wrap: {

    paddingHorizontal: PAD,

    marginTop: 16,

    marginBottom: 4,

  },

  banner: {

    width: BANNER_W,

    borderRadius: 16,

    flexDirection: "row",

    alignItems: "center",

    overflow: "hidden",

    paddingLeft: 18,

    paddingRight: 6,

  },

  bubbleA: {

    top: -18,

    left: "22%",

  },

  bubbleB: {

    top: 8,

    left: "38%",

  },

  bubbleC: {

    bottom: -10,

    left: "30%",

  },

  bubbleD: {

    top: 12,

    right: "28%",

  },

  diamondA: {

    top: 18,

    left: "48%",

  },

  diamondB: {

    top: 28,

    left: "58%",

  },

  diamondC: {

    bottom: 20,

    left: "42%",

  },

  diamondD: {

    top: 14,

    left: "36%",

  },

  diamondE: {

    bottom: 24,

    right: "34%",

  },

  sparkFloatA: {

    position: "absolute",

    top: 10,

    left: "52%",

    fontSize: 9,

    color: "rgba(253,224,71,0.55)",

  },

  sparkFloatB: {

    position: "absolute",

    bottom: 14,

    left: "46%",

    fontSize: 8,

    color: "rgba(125,211,252,0.5)",

  },

  textCol: {

    flex: 1,

    zIndex: 2,

    justifyContent: "center",

    paddingRight: 4,

  },

  tagline: {

    fontSize: 12,

    fontWeight: "600",

    color: TAGLINE_GREEN,

    letterSpacing: 0.05,

  },

  sparkleEmoji: {

    fontSize: 12,

  },

  brandBlock: {

    marginTop: 4,

    alignItems: "flex-start",

  },

  brandRow: {

    flexDirection: "row",

    alignItems: "baseline",

  },

  gati: {

    fontSize: 24,

    fontWeight: "900",

    color: GATI_GREEN,

    letterSpacing: -0.6,

    lineHeight: 28,

  },

  mitra: {

    fontSize: 24,

    fontWeight: "900",

    color: MITRA_DARK,

    letterSpacing: -0.6,

    lineHeight: 28,

  },

  /** Bottom arc of a circle — reference swoosh under GatiMitra */

  swooshClip: {

    height: 5,

    overflow: "hidden",

    marginTop: 1,

  },

  swooshArc: {

    height: 10,

    borderRadius: 999,

    backgroundColor: SWOOSH_GREEN,

    marginTop: 2,

  },

  artWrap: {

    alignItems: "flex-end",

    justifyContent: "center",

    zIndex: 2,

  },

});


