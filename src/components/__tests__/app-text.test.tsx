import React, { createRef } from 'react';
import { AccessibilityInfo, StyleSheet, TextInput as RNTextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';

import { Text, TextInput } from '@/src/components/app-text';
import { AccessibilityPrefsProvider } from '@/src/context/accessibility-context';

/** Renders inside the real provider with Text size stored as `textSize`. */
async function renderAt(textSize: 'default' | 'large' | 'xl', ui: React.ReactElement) {
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify({ textSize }));
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  render(<AccessibilityPrefsProvider>{ui}</AccessibilityPrefsProvider>);
  await act(async () => {});
}

const flat = (testID: string) => StyleSheet.flatten(screen.getByTestId(testID).props.style);

describe('app Text', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders unchanged at Default', async () => {
    await renderAt('default', <Text testID="t" style={{ fontSize: 16, lineHeight: 24 }}>Hi</Text>);
    expect(flat('t')).toEqual({ fontSize: 16, lineHeight: 24 });
  });

  it('scales its own size at Extra large', async () => {
    await renderAt('xl', <Text testID="t" style={{ fontSize: 10, lineHeight: 20 }}>Hi</Text>);
    expect(flat('t').fontSize).toBeCloseTo(13);
    expect(flat('t').lineHeight).toBeCloseTo(26);
  });

  // Scaling it again would compound with the parent's.
  it('leaves a nested Text without its own size to inherit', async () => {
    await renderAt(
      'xl',
      <Text testID="outer" style={{ fontSize: 10 }}>
        Read <Text testID="inner" style={{ fontWeight: 'bold' }}>this</Text>
      </Text>,
    );
    expect(flat('outer').fontSize).toBeCloseTo(13);
    expect(flat('inner').fontSize).toBeUndefined();
  });

  // The chat share image is a fixed-size picture.
  it('opts out with allowFontScaling={false}', async () => {
    await renderAt('xl', <Text testID="t" allowFontScaling={false} style={{ fontSize: 10 }}>Hi</Text>);
    expect(flat('t').fontSize).toBe(10);
  });

  // The header's cap exists because its bar can't grow.
  it('keeps a maxFontSizeMultiplier as the ceiling on the combined size', async () => {
    await renderAt('xl', <Text testID="t" maxFontSizeMultiplier={1.5} style={{ fontSize: 10 }}>Hi</Text>);
    const el = screen.getByTestId('t');
    expect(flat('t').fontSize).toBeCloseTo(13);
    expect(el.props.maxFontSizeMultiplier).toBeCloseTo(1.5 / 1.3);
  });
});

describe('app TextInput', () => {
  beforeEach(() => jest.clearAllMocks());

  it('scales its text', async () => {
    await renderAt('large', <TextInput testID="i" style={{ fontSize: 20 }} />);
    expect(flat('i').fontSize).toBeCloseTo(23);
  });

  // Screens focus fields through refs (`useRef<TextInput>`).
  it('forwards its ref to the native input', async () => {
    const ref = createRef<TextInput>();
    await renderAt('xl', <TextInput ref={ref} style={{ fontSize: 20 }} />);
    expect(ref.current).toBeInstanceOf(RNTextInput);
  });
});
