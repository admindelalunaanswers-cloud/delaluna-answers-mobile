import { drawChatSpread, drawTarotSpread } from '@/src/services/tarot-card.service';

// The draw helpers are pure, but the module reaches Firestore for the cached
// daily pack, so the SDK has to be stubbed for the import to resolve.
jest.mock('firebase/firestore');
jest.mock('@/firebaseConfig', () => ({ db: {} }));

describe('drawTarotSpread', () => {
  it('is deterministic for a given seed', () => {
    expect(drawTarotSpread('user1_2026-08-17', 3)).toEqual(
      drawTarotSpread('user1_2026-08-17', 3),
    );
  });

  it('gives different users different cards on the same day', () => {
    const a = drawTarotSpread('user1_2026-08-17', 1)[0];
    const b = drawTarotSpread('user2_2026-08-17', 1)[0];

    expect(a.id).not.toBe(b.id);
  });

  it('returns the requested number of distinct cards', () => {
    const cards = drawTarotSpread('seed', 3);

    expect(cards).toHaveLength(3);
    expect(new Set(cards.map(c => c.id)).size).toBe(3);
  });

  it('produces a fully populated card', () => {
    const [card] = drawTarotSpread('seed', 1);

    expect(typeof card.id).toBe('number');
    expect(card.name.length).toBeGreaterThan(0);
    expect(card.imagePath.length).toBeGreaterThan(0);
    expect(typeof card.reversed).toBe('boolean');
    expect(card.keywords.length).toBeGreaterThan(0);
    expect(card.meaning.length).toBeGreaterThan(0);
  });

  it('reverses some cards but not all', () => {
    const orientations = Array.from(
      { length: 60 },
      (_, i) => drawTarotSpread(`seed_${i}`, 1)[0].reversed,
    );

    expect(orientations).toContain(true);
    expect(orientations).toContain(false);
  });
});

describe('drawChatSpread', () => {
  it('draws one card by default', () => {
    expect(drawChatSpread('user1', 'should I text him', 0)).toHaveLength(1);
  });

  it('pulls the same card back for the same question — this is what makes a retry stable', () => {
    expect(drawChatSpread('user1', 'should I text him', 0)).toEqual(
      drawChatSpread('user1', 'should I text him', 0),
    );
  });

  it('ignores case and surrounding whitespace in the question', () => {
    expect(drawChatSpread('user1', '  Should I Text Him  ', 0)).toEqual(
      drawChatSpread('user1', 'should i text him', 0),
    );
  });

  it('gives a different card to a different question', () => {
    const a = drawChatSpread('user1', 'should I text him', 0)[0];
    const b = drawChatSpread('user1', 'what about my job', 0)[0];

    expect(a.id).not.toBe(b.id);
  });

  it('gives a different card when the same question is asked later in the thread', () => {
    const first = drawChatSpread('user1', 'should I text him', 0)[0];
    const again = drawChatSpread('user1', 'should I text him', 4)[0];

    expect(first.id).not.toBe(again.id);
  });
});
