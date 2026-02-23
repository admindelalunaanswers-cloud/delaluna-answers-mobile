// src/data/moonPhaseImages.ts
// Static image map for moon phase assets (React Native requires static require calls)

import { ImageSourcePropType } from "react-native";

const MOON_IMAGES = {
  new_moon: require("@/assets/delaluna_moon_assets/style-1/new_moon.png"),
  waxing_crescent_1: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_1.png"),
  waxing_crescent_2: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_2.png"),
  waxing_crescent_3: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_3.png"),
  waxing_crescent_4: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_4.png"),
  waxing_crescent_5: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_5.png"),
  waxing_crescent_6: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_6.png"),
  waxing_crescent_7: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_7.png"),
  waxing_crescent_8: require("@/assets/delaluna_moon_assets/style-1/waxing_crescent_8.png"),
  waxing_gibbous_1: require("@/assets/delaluna_moon_assets/style-1/waxing_gibbous_1.png"),
  waxing_gibbous_2: require("@/assets/delaluna_moon_assets/style-1/waxing_gibbous_2.png"),
  waxing_gibbous_3: require("@/assets/delaluna_moon_assets/style-1/waxing_gibbous_3.png"),
  waxing_gibbous_4: require("@/assets/delaluna_moon_assets/style-1/waxing_gibbous_4.png"),
  full_moon: require("@/assets/delaluna_moon_assets/style-1/full_moon.png"),
  waning_gibbous_1: require("@/assets/delaluna_moon_assets/style-1/waning_gibbous_1.png"),
  waning_gibbous_2: require("@/assets/delaluna_moon_assets/style-1/waning_gibbous_2.png"),
  waning_gibbous_3: require("@/assets/delaluna_moon_assets/style-1/waning_gibbous_3.png"),
  waning_gibbous_4: require("@/assets/delaluna_moon_assets/style-1/waning_gibbous_4.png"),
  waning_gibbous_5: require("@/assets/delaluna_moon_assets/style-1/waning_gibbous_5.png"),
  last_quarter: require("@/assets/delaluna_moon_assets/style-1/last_quarter.png"),
  waning_crescent_1: require("@/assets/delaluna_moon_assets/style-1/waning_crescent_1.png"),
  waning_crescent_2: require("@/assets/delaluna_moon_assets/style-1/waning_crescent_2.png"),
  waning_crescent_3: require("@/assets/delaluna_moon_assets/style-1/waning_crescent_3.png"),
  waning_crescent_4: require("@/assets/delaluna_moon_assets/style-1/waning_crescent_4.png"),
} as const;

/**
 * Picks the variant number (1-based) from an illumination percentage.
 * Clamps to [1, totalVariants].
 */
function pickVariant(fraction: number, totalVariants: number): number {
  const v = Math.ceil(fraction * totalVariants);
  return Math.max(1, Math.min(v, totalVariants));
}

/**
 * Returns the correct moon phase image source based on the phase name
 * and illumination percentage (0-100).
 *
 * Phase names match the normalized API values:
 *   "New Moon" | "Waxing Crescent" | "First Quarter" | "Waxing Gibbous"
 *   "Full Moon" | "Waning Gibbous" | "Last Quarter" | "Waning Crescent"
 */
export function getMoonPhaseImage(
  phaseName: string,
  illumination: number,
): ImageSourcePropType {
  // Normalize illumination to 0-1
  const illum = illumination > 1 ? illumination / 100 : illumination;

  switch (phaseName) {
    case "New Moon":
      return MOON_IMAGES.new_moon;

    case "Waxing Crescent": {
      // illumination ~0-50%, 8 variants (1 = thinnest sliver, 8 = near half)
      const v = pickVariant(illum / 0.5, 8);
      return MOON_IMAGES[`waxing_crescent_${v}` as keyof typeof MOON_IMAGES];
    }

    case "First Quarter":
      // No dedicated first_quarter asset — use the fullest waxing crescent
      return MOON_IMAGES.waxing_crescent_8;

    case "Waxing Gibbous": {
      // illumination ~50-100%, 4 variants (1 = just past half, 4 = near full)
      const v = pickVariant((illum - 0.5) / 0.5, 4);
      return MOON_IMAGES[`waxing_gibbous_${v}` as keyof typeof MOON_IMAGES];
    }

    case "Full Moon":
      return MOON_IMAGES.full_moon;

    case "Waning Gibbous": {
      // illumination ~100-50%, 5 variants (1 = just past full, 5 = near half)
      const v = pickVariant((1 - illum) / 0.5, 5);
      return MOON_IMAGES[`waning_gibbous_${v}` as keyof typeof MOON_IMAGES];
    }

    case "Last Quarter":
      return MOON_IMAGES.last_quarter;

    case "Waning Crescent": {
      // illumination ~50-0%, 4 variants (1 = near half, 4 = thinnest sliver)
      const v = pickVariant((0.5 - illum) / 0.5, 4);
      return MOON_IMAGES[`waning_crescent_${v}` as keyof typeof MOON_IMAGES];
    }

    default:
      return MOON_IMAGES.new_moon;
  }
}
