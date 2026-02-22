/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
});

// Dark Cosmic Design System

export const C = {
  // Deep backgrounds
  void:       '#240046',
  cosmos:     '#513877',
  nebula:     '#0c0c24',
  deepSpace:  '#101030',
  starfield:  '#1c1c48',

  // Active elements
  activeTab: '#fbfbfbff',
  inactiveTabs: '#BCA8F4',

  // Gold — primary accent
  gold:       '#d4a853',
  goldBright: '#f0c97a',
  goldMid:    '#b8912e',
  goldDim:    '#6e5020',

  // Purple — secondary accent
  purple:     '#8b6fc8',
  purpleLight:'#b99ae0',
  purpleDim:  '#3a2860',

  // Moon/planet tones
  moonSilver: '#c8d4e8',
  nebulaTeal: '#6890b0',
  dimText:    '#40506a',

  // Text
  white:      '#f0f0ff',
  muted:      '#9098b8',

  // Retrograde
  retro:      '#e05050',
  retroBg:    '#ff404010',

  // Planet palette
  planet: {
    Sun:      '#ffb347',
    Moon:     '#c8d4e8',
    Mercury:  '#aaaacc',
    Venus:    '#e8c09a',
    Mars:     '#d04040',
    Jupiter:  '#d4a853',
    Saturn:   '#a8905a',
    Uranus:   '#60c8c8',
    Neptune:  '#4878d0',
    Pluto:    '#9060a0',
    'N. Node':'#70a060',
    Chiron:   '#a07868',
  } as Record<string, string>,
};

export const S = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const R = {
  sm: 6, md: 12, lg: 18, xl: 24, pill: 999,
};
