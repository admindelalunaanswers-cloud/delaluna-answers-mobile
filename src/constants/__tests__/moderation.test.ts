import {
  BLOCKABLE_FEATURES,
  blockedMessage,
  FEATURE_LABELS,
  isFeatureBlocked,
  type ModerationDoc,
} from '@/src/constants/moderation';

describe('isFeatureBlocked', () => {
  it('treats an unmoderated account as unblocked', () => {
    for (const f of BLOCKABLE_FEATURES) {
      expect(isFeatureBlocked(null, f)).toBe(false);
      expect(isFeatureBlocked(undefined, f)).toBe(false);
      expect(isFeatureBlocked({}, f)).toBe(false);
    }
  });

  it('treats an empty block list as unblocked', () => {
    const mod: ModerationDoc = { blockedFeatures: [] };
    for (const f of BLOCKABLE_FEATURES) {
      expect(isFeatureBlocked(mod, f)).toBe(false);
    }
  });

  it('blocks exactly the listed feature', () => {
    const mod: ModerationDoc = { blockedFeatures: ['connections'] };
    expect(isFeatureBlocked(mod, 'connections')).toBe(true);
    expect(isFeatureBlocked(mod, 'chat')).toBe(false);
    expect(isFeatureBlocked(mod, 'tarot')).toBe(false);
  });

  // The widening that keeps "block chat" from leaving an open route to the
  // same model. sendChatMessage applies the same rule server-side; if this
  // test fails the two halves have drifted and tarot is reachable.
  it('widens a chat block to cover tarot', () => {
    const mod: ModerationDoc = { blockedFeatures: ['chat'] };
    expect(isFeatureBlocked(mod, 'chat')).toBe(true);
    expect(isFeatureBlocked(mod, 'tarot')).toBe(true);
  });

  it('does not widen a tarot block back to chat', () => {
    const mod: ModerationDoc = { blockedFeatures: ['tarot'] };
    expect(isFeatureBlocked(mod, 'tarot')).toBe(true);
    expect(isFeatureBlocked(mod, 'chat')).toBe(false);
  });

  it('ignores a malformed blockedFeatures value', () => {
    const mod = { blockedFeatures: 'chat' } as unknown as ModerationDoc;
    expect(isFeatureBlocked(mod, 'chat')).toBe(false);
  });

  it('ignores unknown feature names in the list', () => {
    const mod = {
      blockedFeatures: ['horoscope', 'nonsense'],
    } as unknown as ModerationDoc;
    expect(isFeatureBlocked(mod, 'chat')).toBe(false);
    expect(isFeatureBlocked(mod, 'connections')).toBe(false);
  });
});

describe('labels', () => {
  it('has a label for every blockable feature', () => {
    for (const f of BLOCKABLE_FEATURES) {
      expect(FEATURE_LABELS[f]).toBeTruthy();
      expect(blockedMessage(f)).toContain(FEATURE_LABELS[f]);
    }
  });
});
