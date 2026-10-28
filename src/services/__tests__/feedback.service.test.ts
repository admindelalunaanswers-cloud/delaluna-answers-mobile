import { httpsCallable } from 'firebase/functions';

import { submitFeedback } from '@/src/services/feedback.service';

jest.mock('@/firebaseConfig', () => ({ functions: { __mock: 'functions' } }));

const callable = jest.fn(() => Promise.resolve({ data: { id: 'f1' } }));

describe('submitFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (httpsCallable as jest.Mock).mockReturnValue(callable);
  });

  // Only the server writes feedback/; the client never sends an email address.
  it('calls the submitFeedback function with the form and app details only', async () => {
    await submitFeedback({ rating: 4, loved: ['Tarot'], improve: [], comment: 'Nice', allowFollowUp: true });

    expect(httpsCallable).toHaveBeenCalledWith({ __mock: 'functions' }, 'submitFeedback');
    const payload = (callable.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(payload).toEqual(expect.objectContaining({ rating: 4, loved: ['Tarot'], comment: 'Nice', allowFollowUp: true }));
    expect(Object.keys(payload).sort()).toEqual(
      ['allowFollowUp', 'appVersion', 'comment', 'improve', 'loved', 'platform', 'rating'].sort(),
    );
  });

  it('throws when the call fails, so the screen can say so', async () => {
    callable.mockRejectedValueOnce(new Error('unavailable') as never);
    await expect(
      submitFeedback({ rating: 1, loved: [], improve: [], comment: '', allowFollowUp: false }),
    ).rejects.toThrow('unavailable');
  });
});
