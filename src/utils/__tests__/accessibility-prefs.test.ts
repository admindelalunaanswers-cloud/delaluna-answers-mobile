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
    expect(parsePrefs(JSON.stringify({ motion: 'reduced', ignoreCustomTheme: true }))).toEqual({
      motion: 'reduced',
      ignoreCustomTheme: true,
    });
  });

  // Field by field, so one bad value doesn't discard the others.
  it('defaults only the fields that are missing or invalid', () => {
    expect(parsePrefs(JSON.stringify({ motion: 'sometimes', ignoreCustomTheme: true }))).toEqual({
      motion: 'system',
      ignoreCustomTheme: true,
    });
    expect(parsePrefs(JSON.stringify({ motion: 'reduced' }))).toEqual({
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
    expect(resolvePrefs({ motion: 'reduced', ignoreCustomTheme: false }, { reduceMotion: false }).reduceMotion).toBe(
      true,
    );
  });

  it('passes the theme choice through', () => {
    expect(resolvePrefs({ motion: 'system', ignoreCustomTheme: true }, { reduceMotion: false }).ignoreCustomTheme).toBe(
      true,
    );
  });
});

describe('isDefaultPrefs', () => {
  it('is true only when every setting is at its default', () => {
    expect(isDefaultPrefs({ ...DEFAULT_ACCESSIBILITY_PREFS })).toBe(true);
    expect(isDefaultPrefs({ motion: 'reduced', ignoreCustomTheme: false })).toBe(false);
    expect(isDefaultPrefs({ motion: 'system', ignoreCustomTheme: true })).toBe(false);
  });
});

describe('motionSystemCaption', () => {
  it('says what the device is doing', () => {
    expect(motionSystemCaption({ reduceMotion: false })).toBe('Following your device: motion allowed.');
    expect(motionSystemCaption({ reduceMotion: true })).toBe('Following your device: motion reduced.');
  });
});
