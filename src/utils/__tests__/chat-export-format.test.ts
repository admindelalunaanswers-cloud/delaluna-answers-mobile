import {
  answerToHtml,
  buildChatHtml,
  buildChatText,
  countChatMessages,
  excerptForCard,
  exportFileName,
  exportHeading,
  exportSummaryLine,
  exportableFromSession,
  exportableFromThread,
  formatBirthDetails,
  type ExportableChat,
} from '@/src/utils/chat-export-format';
import type { ChatMessageDoc, SavedChatSession } from '@/src/services/chat.service';

const msg = (id: string, over: Partial<ChatMessageDoc> = {}): ChatMessageDoc => ({
  id,
  prompt: 'p',
  userMessage: `Question ${id}?`,
  response: `Answer ${id}.`,
  isPending: false,
  isError: false,
  createdAt: new Date('2026-10-21T15:00:00Z'),
  mode: 'astrology',
  ...over,
});

const CHAT: ExportableChat = {
  title: 'How does a new love interest affect my current relationship?',
  date: new Date('2026-10-21T15:00:00Z'),
  turns: [
    {
      question: 'How does a new love interest affect my current relationship?',
      answer: 'Well, look at you.\n\n* The setup is on **autopilot**.\n* A *stress test*.\n\nClear the lot.',
      askedAt: new Date('2026-10-21T15:00:00Z'),
      mode: 'astrology',
    },
  ],
};

describe('exportableFromThread', () => {
  it('keeps only answered turns and titles the chat by its first one', () => {
    const chat = exportableFromThread([
      msg('a', { response: null, isError: true }),
      msg('b'),
      msg('c', { response: null, isPending: true }),
    ]);

    expect(chat?.turns.map((t) => t.question)).toEqual(['Question b?']);
    expect(chat?.title).toBe('Question b?');
  });

  it('is null when nothing has been answered', () => {
    expect(exportableFromThread([msg('a', { response: null, isPending: true })])).toBeNull();
  });

  it('carries the card names for tarot turns', () => {
    const chat = exportableFromThread(
      [msg('t', { mode: 'tarot' })],
      new Map([['t', ['The Tower (reversed)']]]),
    );
    expect(chat?.turns[0].cards).toEqual(['The Tower (reversed)']);
  });
});

describe('exportableFromSession', () => {
  it('falls back to the session mode for turns that predate per-turn modes', () => {
    const session = {
      id: 's',
      title: 'Saved',
      mode: 'tarot',
      savedAt: new Date(),
      messages: [{ userMessage: 'Q?', response: 'A.', createdAt: new Date() }],
    } as SavedChatSession;

    expect(exportableFromSession(session)?.turns[0].mode).toBe('tarot');
  });
});

describe('labels', () => {
  it('counts a question and its reply as two messages', () => {
    expect(
      countChatMessages([
        { userMessage: 'Q', response: 'A' },
        { userMessage: 'Q2', response: null },
      ]),
    ).toBe(3);
  });

  it('summarises reader, date and count', () => {
    expect(exportSummaryLine(CHAT)).toBe('Astrology · Oct 21, 2026 · 2 messages');
  });

  it('says when a thread changed reader', () => {
    const mixed = {
      ...CHAT,
      turns: [...CHAT.turns, { ...CHAT.turns[0], mode: 'tarot' as const }],
    };
    expect(exportSummaryLine(mixed)).toMatch(/^Astrology & Tarot · /);
  });

  // The title is the first question — showing it would undo the switch.
  it('does not use the question as the heading when questions are left out', () => {
    expect(exportHeading(CHAT, true)).toBe(CHAT.title);
    expect(exportHeading(CHAT, false)).toBe('Astrology reading');
  });
});

describe('formatBirthDetails', () => {
  const birthday = { toDate: () => new Date('1994-03-04T00:00:00Z') };

  // Stored as midnight UTC: read in local time it would be Mar 3 anywhere west
  // of Greenwich.
  it('reads the birthday in UTC and formats the time', () => {
    expect(
      formatBirthDetails({
        birthday: birthday as never,
        birthtime: '14:05',
        placeOfBirth: 'Chicago, IL',
      }),
    ).toBe('Born Mar 4, 1994 · 2:05 PM · Chicago, IL');
  });

  // What sign-up and Edit Profile actually store. The fixture above is a
  // Timestamp, which is what UserDoc claimed — and why this went unnoticed.
  it('reads the "YYYY-MM-DD" string the app stores', () => {
    expect(
      formatBirthDetails({
        birthday: '1994-03-04' as never,
        birthtime: '14:05',
        placeOfBirth: 'Chicago, IL',
      }),
    ).toBe('Born Mar 4, 1994 · 2:05 PM · Chicago, IL');
  });

  it('skips a birthday string it cannot read rather than printing it', () => {
    expect(
      formatBirthDetails({ birthday: 'sometime in March' as never, placeOfBirth: 'Chicago, IL' }),
    ).toBe('Born Chicago, IL');
  });

  it('leaves out what the user said they do not know', () => {
    expect(
      formatBirthDetails({
        birthday: birthday as never,
        birthtime: '00:00',
        isBirthTimeUnknown: true,
        placeOfBirth: 'Somewhere',
        isPlaceOfBirthUnknown: true,
      }),
    ).toBe('Born Mar 4, 1994');
  });

  it('is null with nothing to show', () => {
    expect(formatBirthDetails(null)).toBeNull();
    expect(formatBirthDetails({})).toBeNull();
  });
});

describe('buildChatText', () => {
  it('includes the question, the plain reply and the footer', () => {
    const text = buildChatText(CHAT, { includeQuestions: true });

    expect(text).toContain('You asked:\nHow does a new love interest');
    expect(text).toContain('Delaluna:\nWell, look at you.');
    expect(text).toContain('• The setup is on autopilot.');
    expect(text).not.toContain('**');
    expect(text.endsWith('— Exported from Delaluna')).toBe(true);
  });

  it('leaves every trace of the question out when asked to', () => {
    const text = buildChatText(CHAT, { includeQuestions: false });

    expect(text).not.toContain('new love interest');
    expect(text).not.toContain('You asked');
  });

  it('adds birth details only when given', () => {
    expect(buildChatText(CHAT, { includeQuestions: true })).not.toContain('Born');
    expect(
      buildChatText(CHAT, { includeQuestions: true, birthDetails: 'Born Mar 4, 1994' }),
    ).toContain('Born Mar 4, 1994');
  });
});

describe('buildChatHtml', () => {
  it('escapes what the user and the model wrote', () => {
    const chat: ExportableChat = {
      ...CHAT,
      title: '<script>alert(1)</script>',
      turns: [{ ...CHAT.turns[0], question: '<b>hi</b>', answer: 'a & b <i>' }],
    };
    const html = buildChatHtml(chat, { includeQuestions: true });

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;hi&lt;/b&gt;');
    expect(html).toContain('a &amp; b &lt;i&gt;');
  });

  it('draws the logo as a mask when it has one, a wordmark otherwise', () => {
    expect(buildChatHtml(CHAT, { includeQuestions: true }, 'data:image/png;base64,AA')).toContain(
      "mask-image:url('data:image/png;base64,AA')",
    );
    expect(buildChatHtml(CHAT, { includeQuestions: true })).toContain('class="wordmark"');
  });

  it('turns bullets into a list and keeps emphasis', () => {
    expect(answerToHtml(CHAT.turns[0].answer)).toBe(
      '<p>Well, look at you.</p>' +
        '<ul><li>The setup is on <strong>autopilot</strong>.</li><li>A <em>stress test</em>.</li></ul>' +
        '<p>Clear the lot.</p>',
    );
  });

  it('drops the persona’s --- section rules', () => {
    expect(answerToHtml('One.\n---\nTwo.')).not.toContain('---');
  });
});

describe('excerptForCard', () => {
  it('leaves a short reply alone', () => {
    expect(excerptForCard('Short.')).toBe('Short.');
  });

  it('cuts a long reply at a sentence end', () => {
    const long = 'First sentence here. '.repeat(40);
    const out = excerptForCard(long, 100);

    expect(out.length).toBeLessThanOrEqual(102);
    expect(out.endsWith('. …')).toBe(true);
  });
});

describe('exportFileName', () => {
  it('strips characters a file system rejects', () => {
    expect(exportFileName('Is he/she: "the one"?', 'pdf')).toBe('Delaluna - Is he she the one.pdf');
  });
});
