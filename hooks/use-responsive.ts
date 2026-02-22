import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 375; // iPhone SE / standard baseline

/**
 * Returns a `moderateScale` function that scales sizes proportionally to screen
 * width, but only by `factor` fraction of the full proportional change.
 * factor=0.3 means a 428px screen grows a 32px value to ~34px — subtle and smooth.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const scale = (size: number) => (size * width) / BASE_WIDTH;

  const moderateScale = (size: number, factor = 0.3) =>
    Math.round(size + (scale(size) - size) * factor);

  return { width, height, moderateScale };
}
