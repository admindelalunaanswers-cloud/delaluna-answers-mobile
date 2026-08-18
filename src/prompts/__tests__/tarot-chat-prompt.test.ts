import {
  buildTarotSystemContext,
  formatTarotDraw,
  TAROT_CHAT_SYSTEM_PROMPT,
} from '@/src/prompts/tarot-chat-prompt';
import type { DrawnTarotCard } from '@/src/types/tarot-cards.type';

function card(overrides: Partial<DrawnTarotCard> = {}): DrawnTarotCard {
  return {
    id: 7,
    name: 'The Tower',
    imagePath: '7.png',
    reversed: false,
    keywords: ['upheaval', 'sudden change'],
    meaning: 'The structure was never sound.',
    ...overrides,
  };
}

describe('buildTarotSystemContext', () => {
  it('substitutes every pronoun marker', () => {
    const prompt = buildTarotSystemContext('she/her');

    expect(prompt).toContain('Use she/her to refer to the user.');
    expect(prompt).not.toContain('{{pronouns}}');
  });

  it('falls back to they/them when pronouns are unset or blank', () => {
    for (const value of [undefined, '', '   ']) {
      expect(buildTarotSystemContext(value)).toContain('Use they/them to refer to the user.');
    }
  });

  it('keeps the tarot persona distinct from the astrology one', () => {
    // The card is the read here — the astrology persona leads with the chart.
    expect(TAROT_CHAT_SYSTEM_PROMPT).toContain('AI tarot reader');
    expect(TAROT_CHAT_SYSTEM_PROMPT).toContain('the card(s) pulled ARE the read');
  });

  it('tells the reader the bracketed markers are internal', () => {
    // The continuity pipeline injects these; printing them would leak plumbing.
    expect(TAROT_CHAT_SYSTEM_PROMPT).toContain('[[CARD]]');
    expect(TAROT_CHAT_SYSTEM_PROMPT).toContain('never mention or print them');
  });
});

describe('formatTarotDraw', () => {
  it('names the card, its orientation, keywords and meaning', () => {
    expect(formatTarotDraw([card()])).toBe(
      'The Tower (upright) — upheaval, sudden change. The structure was never sound.',
    );
  });

  it('marks a reversed card as reversed', () => {
    expect(formatTarotDraw([card({ reversed: true })])).toContain('The Tower (reversed)');
  });

  it('separates a multi-card spread', () => {
    const out = formatTarotDraw([card(), card({ id: 3, name: 'The Star' })]);

    expect(out).toContain('The Tower');
    expect(out).toContain('The Star');
    expect(out.split(' | ')).toHaveLength(2);
  });

  it('returns empty string for an empty draw', () => {
    expect(formatTarotDraw([])).toBe('');
  });
});
