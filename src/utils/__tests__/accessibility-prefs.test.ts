import {
  DEFAULT_ACCESSIBILITY_PREFS,
  isDefaultPrefs,
  motionSystemCaption,
  parsePrefs,
  resolvePrefs,
} from '@/src/utils/accessibility-prefs';

describe('parsePrefs', () => {
  it('returns defaults when nothing is stored', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_ACCESSIBILITY_PREFS);
    expect(parsePrefs(undefined)).toEqual(DEFAULT_ACCESSIBILITY_PREFS);
    expect(parsePrefs('')).toEqual(DEFAULT_ACCESSIBILITY_PREFS);
  });

  // A corrupt entry must never stop the app rendering.
  it('returns defaults for unreadable values', () => {
    expect(parsePrefs('{not json')).toEqual(DEFAULT_ACCESSIBILITY_PREFS);
    expect(parsePrefs('null')).toEqual(DEFAULT_ACCESSIBILITY_PREFS);
    expect(parsePrefs('"reduced"')).toEqual(DEFAULT_ACCESSIBILITY_PREFS);
  });

  it('reads back a stored value', () => {
    expect(parsePrefs(JSON.stringify({ textSize: 'xl', motion: 'reduced', ignoreCustomTheme: true }))).toEqual({
      textSize: 'xl',
      motion: 'reduced',
      ignoreCustomTheme: true,
    });
  });

  // Field by field, so one bad value doesn't discard the others.
  it('defaults only the fields that are missing or invalid', () => {
    expect(parsePrefs(JSON.stringify({ textSize: 'huge', motion: 'sometimes', ignoreCustomTheme: true }))).toEqual({
      textSize: 'default',
      motion: 'system',
      ignoreCustomTheme: true,
    });
    // A value saved before Text size existed.
    expect(parsePrefs(JSON.stringify({ motion: 'reduced' }))).toEqual({
      textSize: 'default',
      motion: 'reduced',
      ignoreCustomTheme: false,
    });
  });

  it('never hands back the shared default object', () => {
    expect(parsePrefs(null)).not.toBe(DEFAULT_ACCESSIBILITY_PREFS);
  });
});

describe('resolvePrefs', () => {
  it('follows the device while motion is System', () => {
    expect(resolvePrefs({ ...DEFAULT_ACCESSIBILITY_PREFS }, { reduceMotion: false }).reduceMotion).toBe(false);
    expect(resolvePrefs({ ...DEFAULT_ACCESSIBILITY_PREFS }, { reduceMotion: true }).reduceMotion).toBe(true);
  });

  it('reduces motion when chosen in the app, whatever the device says', () => {
    expect(resolvePrefs({ ...DEFAULT_ACCESSIBILITY_PREFS, motion: 'reduced' }, { reduceMotion: false }).reduceMotion).toBe(
      true,
    );
  });

  it('turns the text size into a multiplier', () => {
    const at = (textSize: 'default' | 'large' | 'xl') =>
      resolvePrefs({ ...DEFAULT_ACCESSIBILITY_PREFS, textSize }, { reduceMotion: false }).fontScale;
    expect(at('default')).toBe(1);
    expect(at('large')).toBe(1.15);
    expect(at('xl')).toBe(1.3);
  });

  it('passes the theme choice through', () => {
    expect(resolvePrefs({ ...DEFAULT_ACCESSIBILITY_PREFS, ignoreCustomTheme: true }, { reduceMotion: false }).ignoreCustomTheme).toBe(
      true,
    );
  });
});

describe('isDefaultPrefs', () => {
  it('is true only when every setting is at its default', () => {
    expect(isDefaultPrefs({ ...DEFAULT_ACCESSIBILITY_PREFS })).toBe(true);
    expect(isDefaultPrefs({ ...DEFAULT_ACCESSIBILITY_PREFS, motion: 'reduced' })).toBe(false);
    expect(isDefaultPrefs({ ...DEFAULT_ACCESSIBILITY_PREFS, ignoreCustomTheme: true })).toBe(false);
    expect(isDefaultPrefs({ ...DEFAULT_ACCESSIBILITY_PREFS, textSize: 'large' })).toBe(false);
  });
});

describe('motionSystemCaption', () => {
  it('says what the device is doing', () => {
    expect(motionSystemCaption({ reduceMotion: false })).toBe('Following your device: motion allowed.');
    expect(motionSystemCaption({ reduceMotion: true })).toBe('Following your device: motion reduced.');
  });
});
