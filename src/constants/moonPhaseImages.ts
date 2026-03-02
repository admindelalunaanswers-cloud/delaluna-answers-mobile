// src/constants/moonPhaseImages.ts
// SVG imports — react-native-svg-transformer returns React components

import { ComponentType } from "react";
import { SvgProps } from "react-native-svg";

import NewMoon from "@/src/assets/moon-phases/new_moon.svg";
import WaxingCrescent from "@/src/assets/moon-phases/waxing_crescent.svg";
import FirstQuarter from "@/src/assets/moon-phases/first_quarter.svg";
import WaxingGibbous from "@/src/assets/moon-phases/waxing_gibbous.svg";
import FullMoon from "@/src/assets/moon-phases/full_moon.svg";
import WaningGibbous from "@/src/assets/moon-phases/waning_gibbous.svg";
import ThirdQuarter from "@/src/assets/moon-phases/third_quarter.svg";
import WaningCrescent from "@/src/assets/moon-phases/waning_crescent.svg";

export type MoonSvgComponent = ComponentType<SvgProps>;

/**
 * Returns the SVG component for the given moon phase name.
 *
 * Phase names match normalized API values:
 *   "New Moon" | "Waxing Crescent" | "First Quarter" | "Waxing Gibbous"
 *   "Full Moon" | "Waning Gibbous" | "Last Quarter" | "Waning Crescent"
 */
export function getMoonPhaseImage(phaseName: string): MoonSvgComponent {
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
