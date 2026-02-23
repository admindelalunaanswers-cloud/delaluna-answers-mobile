import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

const BASE_WIDTH = 375;  // iPhone SE / standard baseline
const BASE_HEIGHT = 812; // iPhone X baseline

export const scale = (size: number) => (size * width) / BASE_WIDTH;

export const verticalScale = (size: number) => (size * height) / BASE_HEIGHT;

export const moderateScale = (size: number, factor = 0.3) =>
  Math.round(size + (scale(size) - size) * factor);
