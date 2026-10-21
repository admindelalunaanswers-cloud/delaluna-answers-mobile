import { signLabel } from '@/src/components/shared/signs-display.component';
import { plainRichText } from '@/src/utils/rich-text';
import { tarotCardLabel } from '@/src/utils/tarot-image';

// signLabel lives beside the component that uses it, which imports expo-router
// and the themed components (→ theme context → firebaseConfig) at module scope.
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/src/components/themed-view', () => ({ ThemedView: 'View' }));
jest.mock('@/src/components/themed-text', () => ({ ThemedText: 'Text' }));

/**
 * Pure helpers that build screen-reader text. Each exists because the visible
 * UI says something a screen reader can't see — an icon, an image, or markup.
 */
describe('plainRichText', () => {
  // accessibilityLabel can't hold styled spans; VoiceOver read the asterisks.
  it('drops emphasis markers but keeps the words', () => {
    expect(plainRichText('Trust **your** *instinct* today')).toBe('Trust your instinct today');
  });

  it('strips section titles the same way renderRichText does', () => {
    expect(plainRichText('**Reality Check:** slow down')).toBe('slow down');
  });

  it('is empty for a missing reply', () => {
    expect(plainRichText(null)).toBe('');
    expect(plainRichText(undefined)).toBe('');
  });
});

describe('tarotCardLabel', () => {
  it('names the card once it is face up', () => {
    expect(tarotCardLabel('The Fool', false, true, 0)).toBe('The Fool');
  });

  // The flipped image is the only other signal that a card is reversed.
  it('says when a card is reversed', () => {
    expect(tarotCardLabel('The Tower', true, true, 1)).toBe('The Tower, reversed');
  });

  it('does not give the card away before the reveal', () => {
    expect(tarotCardLabel('The Fool', false, false, 2)).toBe('Card 3, face down');
  });

  it('falls back to the position when no name was passed', () => {
    expect(tarotCardLabel(undefined, false, true, 0)).toBe('Card 1');
  });
});

describe('signLabel', () => {
  // The sun / moon / arrow icons were the only thing saying which sign is which.
  it('names the placement with the sign', () => {
    expect(signLabel('Sun', 'Aries')).toBe('Sun in Aries');
    expect(signLabel('Rising', 'Virgo')).toBe('Rising in Virgo');
  });

  it('does not read the placeholder dash aloud', () => {
    expect(signLabel('Moon', '—')).toBe('Moon sign not available yet');
  });
});
