import { useWindowDimensions } from 'react-native';

const BASE_WIDTH = 375; // iPhone SE / standard baseline

// Cap scale calculations at iPhone Pro Max width so elements don't over-scale on
// iPad (768–1024 px). The returned `width` is the real device width so callers
// can use it with getContentPadding() for layout decisions.
const MAX_SCALE_WIDTH = 430;

/**
 * Returns a `moderateScale` function that scales sizes proportionally to screen
 * width, but only by `factor` fraction of the full proportional change.
 * factor=0.3 means a 428px screen grows a 32px value to ~34px — subtle and smooth.
 *
 * `width` / `height` reflect the real device dimensions (for layout math).
 * `scale` / `moderateScale` are capped at MAX_SCALE_WIDTH to prevent over-scaling
 * on tablets.
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const scaleWidth = Math.min(width, MAX_SCALE_WIDTH);

  const scale = (size: number) => (size * scaleWidth) / BASE_WIDTH;

  const moderateScale = (size: number, factor = 0.3) =>
    Math.round(size + (scale(size) - size) * factor);

  return { width, height, scale, moderateScale };
}
