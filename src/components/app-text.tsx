/**
 * app-text.tsx
 * The app's <Text> and <TextInput>: React Native's, plus Accessibility → Text
 * size. Import these instead of react-native's — ESLint enforces it in app/
 * and src/ — so every screen follows the setting without carrying its own
 * scaling. They take exactly react-native's props and forward refs.
 *
 * The scaling itself, and what it deliberately leaves alone, is
 * src/utils/text-scale.ts. The device's text size still applies on top.
 *
 * Opting out: `allowFontScaling={false}` turns off both the device's scaling and
 * this one (the chat share image, which is a fixed-size picture).
 */
import React from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { useFontScale } from '@/src/context/accessibility-context';
import { scaleTextStyle } from '@/src/utils/text-scale';

// Usable as types too — `useRef<TextInput>(null)` — like react-native's.
export type Text = RNText;
export type TextInput = RNTextInput;

type TextProps = React.ComponentPropsWithRef<typeof RNText>;
type TextInputProps = React.ComponentPropsWithRef<typeof RNTextInput>;

function useScaled(
  style: StyleProp<TextStyle>,
  maxFontSizeMultiplier: number | null | undefined,
  allowFontScaling: boolean | undefined,
) {
  const scale = useFontScale();
  if (scale === 1 || allowFontScaling === false) return { style, maxFontSizeMultiplier };
  const result = scaleTextStyle({ style: StyleSheet.flatten(style), scale, maxFontSizeMultiplier });
  return {
    style: result.override ? [style, result.override] : style,
    maxFontSizeMultiplier: result.maxFontSizeMultiplier ?? maxFontSizeMultiplier,
  };
}

// Same name as the type above on purpose, as react-native does it.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export function Text(props: TextProps) {
  const scaled = useScaled(props.style, props.maxFontSizeMultiplier, props.allowFontScaling);
  return <RNText {...props} style={scaled.style} maxFontSizeMultiplier={scaled.maxFontSizeMultiplier} />;
}

// Same name as the type above on purpose, as react-native does it.
// eslint-disable-next-line @typescript-eslint/no-redeclare
export function TextInput(props: TextInputProps) {
  const scaled = useScaled(props.style, props.maxFontSizeMultiplier, props.allowFontScaling);
  return <RNTextInput {...props} style={scaled.style} maxFontSizeMultiplier={scaled.maxFontSizeMultiplier} />;
}

/**
 * For text React Native draws without going through <Text> above, such as
 * `Animated.Text`: returns `style` with the in-app size applied.
 */
export function useScaledTextStyle(style: StyleProp<TextStyle>): StyleProp<TextStyle> {
  return useScaled(style, undefined, undefined).style;
}
