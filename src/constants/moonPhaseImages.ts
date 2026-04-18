// src/constants/moonPhaseImages.ts

import { ImageSourcePropType } from "react-native";

import NewMoon from "@/src/assets/moon-phases/new_moon.png";
import WaxingCrescent from "@/src/assets/moon-phases/waxing_crescent.png";
import FirstQuarter from "@/src/assets/moon-phases/first_quarter.png";
import WaxingGibbous from "@/src/assets/moon-phases/waxing_gibbous.png";
import FullMoon from "@/src/assets/moon-phases/full_moon.png";
import WaningGibbous from "@/src/assets/moon-phases/waning_gibbous.png";
import ThirdQuarter from "@/src/assets/moon-phases/third_quarter.png";
import WaningCrescent from "@/src/assets/moon-phases/waning_crescent.png";

/**
 * Returns the PNG image source for the given moon phase name.
 *
 * Phase names match normalized API values:
 *   "New Moon" | "Waxing Crescent" | "First Quarter" | "Waxing Gibbous"
 *   "Full Moon" | "Waning Gibbous" | "Last Quarter" | "Waning Crescent"
 */
export function getMoonPhaseImage(phaseName: string): ImageSourcePropType {
  switch (phaseName) {
    case "New Moon":
      return NewMoon;
    case "Waxing Crescent":
      return WaxingCrescent;
    case "First Quarter":
      return FirstQuarter;
    case "Waxing Gibbous":
      return WaxingGibbous;
    case "Full Moon":
      return FullMoon;
    case "Waning Gibbous":
      return WaningGibbous;
    case "Last Quarter":
      return ThirdQuarter;
    case "Waning Crescent":
      return WaningCrescent;
    default:
      return NewMoon;
  }
}
