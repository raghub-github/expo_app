import { Image } from "react-native";

/** Shared map bike marker — same asset as partnersite /mapbike.png */
export const MAPBIKE_IMAGE = require("../assets/images/mapbike.png");

export function mapbikeMarkerUri(): string {
  return Image.resolveAssetSource(MAPBIKE_IMAGE).uri;
}
