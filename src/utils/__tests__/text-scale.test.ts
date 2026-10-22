import { scaleStyleMap, scaleTextStyle } from '@/src/utils/text-scale';

describe('scaleTextStyle', () => {
  it('changes nothing at Default', () => {
    expect(scaleTextStyle({ style: { fontSize: 16 }, scale: 1 })).toEqual({});
  });

  it("scales the element's own fontSize and lineHeight", () => {
    expect(scaleTextStyle({ style: { fontSize: 16, lineHeight: 24 }, scale: 1.5 }).override).toEqual({
      fontSize: 24,
      lineHeight: 36,
    });
  });

  // A nested <Text> without its own size inherits one its parent already
  // scaled; and a top-level one is left alone rather than guessed at.
  it('leaves an unset fontSize alone', () => {
    expect(scaleTextStyle({ style: { color: 'red' }, scale: 1.3 }).override).toBeUndefined();
    expect(scaleTextStyle({ style: undefined, scale: 1.3 }).override).toBeUndefined();
  });

  it('still scales a lineHeight set without a fontSize', () => {
    expect(scaleTextStyle({ style: { lineHeight: 20 }, scale: 1.5 }).override).toEqual({ lineHeight: 30 });
  });

  describe('with a maxFontSizeMultiplier cap', () => {
    // total = fontSize × in-app × min(device, returned cap)
    const total = (fontSize: number, cap: number, scale: number, device: number) => {
      const r = scaleTextStyle({ style: { fontSize }, scale, maxFontSizeMultiplier: cap });
      return (r.override?.fontSize ?? fontSize) * Math.min(device, r.maxFontSizeMultiplier ?? Infinity);
    };

    it('keeps the cap as a ceiling on in-app × device', () => {
      expect(total(10, 1.5, 1.3, 1)).toBeCloseTo(13); // under the cap: in-app applies
      expect(total(10, 1.5, 1.3, 2)).toBeCloseTo(15); // over it: held at the cap
    });

    it('spends no more than the cap when the in-app size exceeds it', () => {
      const r = scaleTextStyle({ style: { fontSize: 10 }, scale: 1.3, maxFontSizeMultiplier: 1.2 });
      expect(r.override?.fontSize).toBeCloseTo(12);
      expect(r.maxFontSizeMultiplier).toBe(1);
    });

    // React Native treats 0 as "no cap", and ignores values below 1.
    it('ignores a cap of 0 or below 1', () => {
      expect(scaleTextStyle({ style: { fontSize: 10 }, scale: 1.3, maxFontSizeMultiplier: 0 }).maxFontSizeMultiplier).toBeUndefined();
      expect(scaleTextStyle({ style: { fontSize: 10 }, scale: 1.3, maxFontSizeMultiplier: 0.5 }).override?.fontSize).toBeCloseTo(13);
    });
  });
});

describe('scaleStyleMap', () => {
  it('scales every entry that sets a size and keeps the rest', () => {
    const styles = { body: { fontSize: 10, color: 'red' }, strong: { fontWeight: 'bold' as const } };
    const out = scaleStyleMap(styles, 1.5);
    expect(out.body).toEqual({ fontSize: 15, color: 'red' });
    expect(out.strong).toBe(styles.strong);
  });

  it('returns the same object at Default', () => {
    const styles = { body: { fontSize: 10 } };
    expect(scaleStyleMap(styles, 1)).toBe(styles);
  });
});
