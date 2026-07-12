import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const BASE_WIDTH = 375;  // iPhone SE / standard baseline
const BASE_HEIGHT = 812; // iPhone X baseline

// Cap effective dimensions at iPhone Pro Max so scale/moderateScale values don't
// blow up on iPad (768–1024 px). Layout decisions (padding, maxWidth) should use
// the real window width via useWindowDimensions or src/utils/layout.ts.
const MAX_SCALE_WIDTH  = 430; // iPhone 16 Pro Max logical width
const MAX_SCALE_HEIGHT = 932; // iPhone 14 Pro Max logical height

const scaleWidth  = Math.min(width,  MAX_SCALE_WIDTH);
const scaleHeight = Math.min(height, MAX_SCALE_HEIGHT);

export const scale = (size: number) => (size * scaleWidth) / BASE_WIDTH;

export const verticalScale = (size: number) => (size * scaleHeight) / BASE_HEIGHT;

export const moderateScale = (size: number, factor = 0.3) =>
  Math.round(size + (scale(size) - size) * factor);
