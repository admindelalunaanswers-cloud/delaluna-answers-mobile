/**
 * text-scale.ts
 * How Accessibility → Text size changes one text element's style. Pure; the
 * component that applies it is src/components/app-text.tsx.
 *
 * The in-app size multiplies on top of the device's own text size, which React
 * Native still applies afterwards. Only the element's *own* fontSize and
 * lineHeight are scaled — a nested <Text> that sets neither inherits a size its
 * parent already scaled, and scaling it again would compound.
 *
 * An element that sets no fontSize is left alone even at the top level, where it
 * renders at React Native's 14pt default. Scaling that default would mean knowing
 * whether there's a parent <Text>, and a library's own <Text> (Markdown's) is a
 * parent we can't see — guessing wrong puts a 14pt word inside a 15pt paragraph.
 * Give text a fontSize if it should follow the setting.
 */
import type { TextStyle } from 'react-native';

export interface TextScaleInput {
  /** The element's flattened style. */
  style: TextStyle | undefined;
  /** The in-app multiplier (1 = Default). */
  scale: number;
  /** The element's own maxFontSizeMultiplier, if any. */
  maxFontSizeMultiplier?: number | null;
}

export interface TextScaleResult {
  /** Appended after the element's style; undefined when nothing changes. */
  override?: Pick<TextStyle, 'fontSize' | 'lineHeight'>;
  /** Replaces the element's maxFontSizeMultiplier; undefined to leave it. */
  maxFontSizeMultiplier?: number;
}

export function scaleTextStyle({ style, scale, maxFontSizeMultiplier }: TextScaleInput): TextScaleResult {
  if (!(scale > 0) || scale === 1) return {};

  // A cap is a ceiling on the *total* size (in-app × device), not just the
  // device part — it exists because the element's box can't grow (the header
  // bar). So spend the in-app scale out of the cap and hand the rest to the
  // device: total = fs·eff·min(device, cap/eff) = fs·min(eff·device, cap).
  // React Native ignores caps below 1, so 1 is the floor.
  const cap = maxFontSizeMultiplier != null && maxFontSizeMultiplier >= 1 ? maxFontSizeMultiplier : undefined;
  const effective = cap !== undefined ? Math.min(scale, cap) : scale;

  const override: Pick<TextStyle, 'fontSize' | 'lineHeight'> = {};
  const fontSize = style?.fontSize;
  if (typeof fontSize === 'number') override.fontSize = fontSize * effective;
  const lineHeight = style?.lineHeight;
  if (typeof lineHeight === 'number') override.lineHeight = lineHeight * effective;

  return {
    override: Object.keys(override).length ? override : undefined,
    maxFontSizeMultiplier: cap !== undefined ? cap / effective : undefined,
  };
}

/**
 * The same, over a map of named styles — for a library that takes its text
 * styles as an object rather than rendering our <Text> (Markdown).
 */
export function scaleStyleMap<K extends string>(
  styles: Record<K, TextStyle>,
  scale: number,
): Record<K, TextStyle> {
  if (!(scale > 0) || scale === 1) return styles;
  const out = {} as Record<K, TextStyle>;
  for (const key of Object.keys(styles) as K[]) {
    const { override } = scaleTextStyle({ style: styles[key], scale });
    out[key] = override ? { ...styles[key], ...override } : styles[key];
  }
  return out;
}
