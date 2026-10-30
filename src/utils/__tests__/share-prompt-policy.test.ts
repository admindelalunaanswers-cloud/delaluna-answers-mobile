import {
  DEFAULT_SHARE_PROMPT_STATE,
  isBlockedRoute,
  parseSharePromptState,
  recordDismissed,
  recordOptedOut,
  recordShared,
  recordShown,
  SHARE_PROMPT_COOLDOWN_MS,
  SHARE_PROMPT_MAX_DISMISSALS,
  shouldShowSharePrompt,
} from '@/src/utils/share-prompt-policy';

const NOW = 1_800_000_000_000;
const HOME = ['(main)'];

describe('shouldShowSharePrompt', () => {
  it('shows the first time on an ordinary screen', () => {
    expect(shouldShowSharePrompt(DEFAULT_SHARE_PROMPT_STATE, HOME, NOW)).toBe(true);
  });

  it('shows on the chat screen', () => {
    expect(shouldShowSharePrompt(DEFAULT_SHARE_PROMPT_STATE, ['(main)', 'chat'], NOW)).toBe(true);
  });

  it('waits out the cooldown after being shown', () => {
    const shown = recordShown(DEFAULT_SHARE_PROMPT_STATE, NOW);
    expect(shouldShowSharePrompt(shown, HOME, NOW + SHARE_PROMPT_COOLDOWN_MS - 1)).toBe(false);
    expect(shouldShowSharePrompt(shown, HOME, NOW + SHARE_PROMPT_COOLDOWN_MS)).toBe(true);
  });

  it('stops for good after the dismissal cap', () => {
    let s = DEFAULT_SHARE_PROMPT_STATE;
    for (let i = 0; i < SHARE_PROMPT_MAX_DISMISSALS; i++) s = recordDismissed(s);
    expect(shouldShowSharePrompt(s, HOME, NOW)).toBe(false);
  });

  it('sharing clears the dismissal count', () => {
    const s = recordShared(recordDismissed(recordDismissed(DEFAULT_SHARE_PROMPT_STATE)));
    expect(s.dismissals).toBe(0);
  });

  it('never shows after opting out', () => {
    expect(shouldShowSharePrompt(recordOptedOut(DEFAULT_SHARE_PROMPT_STATE), HOME, NOW)).toBe(false);
  });
});

describe('isBlockedRoute', () => {
  it.each([
    [['(auth)', 'login']],
    [['(startup)', 'welcome']],
    [['(settings)', 'paywall']],
    [['(settings)', 'edit-profile']],
    [['(settings)', 'update-password']],
    [['(settings)', 'admin']],
    [['(util)', 'support']],
    [['(util)', 'feedback']],
    [['connection', 'new']],
    [['connection', '[id]', 'edit']],
  ])('blocks %j', (segments) => {
    expect(isBlockedRoute(segments)).toBe(true);
  });

  it.each([
    [['(main)']],
    [['(main)', 'chat']],
    [['(main)', 'transits']],
    [['(home)', 'birth-chart-view']],
    [['connection', '[id]']],
    [['connection', '[id]', 'synastry']],
  ])('allows %j', (segments) => {
    expect(isBlockedRoute(segments)).toBe(false);
  });
});

describe('parseSharePromptState', () => {
  it('falls back to defaults for missing or malformed storage', () => {
    expect(parseSharePromptState(null)).toEqual(DEFAULT_SHARE_PROMPT_STATE);
    expect(parseSharePromptState('{not json')).toEqual(DEFAULT_SHARE_PROMPT_STATE);
    expect(parseSharePromptState('{"dismissals":-2,"optedOut":"yes"}')).toEqual(
      DEFAULT_SHARE_PROMPT_STATE,
    );
  });

  it('round-trips a saved state', () => {
    const s = { lastShownAt: NOW, dismissals: 2, optedOut: true };
    expect(parseSharePromptState(JSON.stringify(s))).toEqual(s);
  });
});
