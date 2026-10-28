import {
  buildChatTurnPrompt,
  MAX_READER_SWITCHES,
  readerSwitchesUsed,
  type ContinuityTurn,
} from '@/src/prompts/chat-continuity';

const SYSTEM = 'PERSONA_BLOB You are Delaluna.';
const CHART = 'Sun in Leo, Moon in Pisces, Scorpio rising.';

/** A completed turn the extension will replay to the model. */
function visible(overrides: Partial<ContinuityTurn> = {}): ContinuityTurn {
  return {
    userMessage: 'is he into me',
    prompt: 'some earlier prompt',
    response: 'He is not.',
    isError: false,
    ...overrides,
  };
}

/** A turn written back by resumeChatSession — invisible to the model. */
function restored(overrides: Partial<ContinuityTurn> = {}): ContinuityTurn {
  return {
    userMessage: 'what about my job',
    prompt: '',
    response: 'Quit.',
    isError: false,
    ...overrides,
  };
}

describe('buildChatTurnPrompt', () => {
  describe('opening a conversation', () => {
    it('sends the persona, the chart and the message when there is no history', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'should I text him',
        systemContext: SYSTEM,
        natalChartSummary: CHART,
      });

      expect(prompt).toContain(SYSTEM);
      expect(prompt).toContain(CHART);
      expect(prompt).toContain('[[NOW]] should I text him');
    });

    it('treats a history of only failed or pending turns as a fresh start', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'hello',
        systemContext: SYSTEM,
        history: [
          visible({ response: null, isError: true }),
          visible({ response: null, isError: false }),
        ],
      });

      expect(prompt).toContain(SYSTEM);
    });
  });

  describe('following up', () => {
    it('does not resend the persona once a turn has been answered', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'why though',
        systemContext: SYSTEM,
        natalChartSummary: CHART,
        history: [visible({ prompt: `${SYSTEM}\n\n[[CHART]] ${CHART}` })],
      });

      expect(prompt).not.toContain(SYSTEM);
      expect(prompt).not.toContain(CHART);
      expect(prompt).toBe('[[NOW]] why though');
    });

    it('sends the chart late if it was not available on the opening turn', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'and my career',
        systemContext: SYSTEM,
        natalChartSummary: CHART,
        history: [visible({ prompt: SYSTEM })],
      });

      expect(prompt).not.toContain(SYSTEM);
      expect(prompt).toContain(CHART);
    });

    it('recognises a pre-update prompt so context is not resent after upgrading', () => {
      const legacy =
        `${SYSTEM}\n\nThe user's natal chart for personalized answers:\n${CHART}\n\nUser: hi`;

      const prompt = buildChatTurnPrompt({
        userMessage: 'go on',
        systemContext: SYSTEM,
        natalChartSummary: CHART,
        history: [visible({ prompt: legacy })],
      });

      expect(prompt).toBe('[[NOW]] go on');
    });
  });

  describe('subject switching', () => {
    const alex = { id: 'alex', name: 'Alex', contextSummary: 'Alex — Aries sun.' };
    const sam = { id: 'sam', name: 'Sam', contextSummary: 'Sam — Taurus sun.' };

    it('introduces the subject on the first turn about them', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'are we compatible',
        systemContext: SYSTEM,
        connection: alex,
        history: [visible({ prompt: SYSTEM })],
      });

      expect(prompt).toContain('[[SUBJECT]] The user is asking about Alex.');
      expect(prompt).toContain(alex.contextSummary);
    });

    it('does not reintroduce the same subject on later turns', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'and now',
        systemContext: SYSTEM,
        connection: alex,
        history: [
          visible({ prompt: `${SYSTEM} [[SUBJECT]] Alex`, connectionId: 'alex' }),
        ],
      });

      expect(prompt).toBe('[[NOW]] and now');
    });

    it('flags a switch to a different person and sends their context', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'what about them',
        systemContext: SYSTEM,
        connection: sam,
        history: [
          visible({ prompt: `${SYSTEM} [[SUBJECT]] Alex`, connectionId: 'alex' }),
        ],
      });

      expect(prompt).toContain('[[SUBJECT_CHANGE]]');
      expect(prompt).toContain('this is about Sam, not whoever was being discussed above');
      expect(prompt).toContain(sam.contextSummary);
    });

    it('flags dropping back to a question about the user alone', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'what about me',
        systemContext: SYSTEM,
        history: [
          visible({ prompt: `${SYSTEM} [[SUBJECT]] Alex`, connectionId: 'alex' }),
        ],
      });

      expect(prompt).toContain('[[SUBJECT_CHANGE]]');
      expect(prompt).toContain('no longer asking about the person discussed above');
    });
  });

  describe('restored sessions', () => {
    it('recaps turns the extension cannot replay', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'so what now',
        systemContext: SYSTEM,
        history: [
          restored({ userMessage: 'will he call', response: 'No.' }),
          restored({ userMessage: 'ever?', response: 'Not this year.' }),
        ],
      });

      // Every restored turn is invisible, so this also re-opens the conversation.
      expect(prompt).toContain(SYSTEM);
      expect(prompt).toContain('[[RECAP:2]]');
      expect(prompt).toContain('User: will he call → You: No.');
      expect(prompt).toContain('User: ever? → You: Not this year.');
    });

    it('does not repeat a recap an earlier turn already carried', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'and after that',
        systemContext: SYSTEM,
        history: [
          restored(),
          restored(),
          visible({ prompt: `${SYSTEM} [[RECAP:2]] …` }),
        ],
      });

      expect(prompt).toBe('[[NOW]] and after that');
    });

    it('re-recaps when a further session is restored on top', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'ok',
        systemContext: SYSTEM,
        history: [
          restored(),
          restored(),
          visible({ prompt: `${SYSTEM} [[RECAP:2]] …` }),
          restored({ userMessage: 'new one', response: 'Sure.' }),
        ],
      });

      expect(prompt).toContain('[[RECAP:3]]');
    });

    it('keeps only the most recent turns and trims long replies', () => {
      const history = Array.from({ length: 10 }, (_, i) =>
        restored({ userMessage: `q${i}`, response: 'x'.repeat(1000) }),
      );

      const prompt = buildChatTurnPrompt({
        userMessage: 'now',
        systemContext: SYSTEM,
        history,
      });

      expect(prompt).toContain('[[RECAP:10]]');
      expect(prompt).not.toContain('User: q3 ');
      expect(prompt).toContain('User: q9');
      expect(prompt).not.toContain('x'.repeat(400));
    });
  });

  describe('tarot mode', () => {
    const DRAW = 'The Tower (reversed) — upheaval. The structure was never sound.';

    it('sends the card alongside the persona on an opening turn', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'should I text him',
        systemContext: SYSTEM,
        mode: 'tarot',
        tarotDraw: DRAW,
      });

      expect(prompt).toContain(SYSTEM);
      // The wording of the lead-in is free to change; what matters is that the
      // draw arrives under the marker the persona is told to act on.
      expect(prompt).toContain('[[CARD]]');
      expect(prompt).toContain(DRAW);
    });

    it('sends a fresh card on every follow-up, unlike the persona', () => {
      const next = 'The Star (upright) — hope. It steadies from here.';
      const prompt = buildChatTurnPrompt({
        userMessage: 'and after that',
        systemContext: SYSTEM,
        mode: 'tarot',
        tarotDraw: next,
        history: [visible({ prompt: `[[READER:tarot]] ${SYSTEM} [[CARD]] ${DRAW}` })],
      });

      expect(prompt).not.toContain(SYSTEM);
      expect(prompt).toContain(next);
    });

    it('puts the card before the message so [[NOW]] stays last', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'should I text him',
        systemContext: SYSTEM,
        mode: 'tarot',
        tarotDraw: DRAW,
      });

      expect(prompt.indexOf('[[CARD]]')).toBeLessThan(prompt.indexOf('[[NOW]]'));
      expect(prompt.endsWith('[[NOW]] should I text him')).toBe(true);
    });

    it('adds nothing in astrology mode', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'should I text him',
        systemContext: SYSTEM,
      });

      expect(prompt).not.toContain('[[CARD]]');
    });

    it('treats a blank draw as no draw', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'hi',
        systemContext: SYSTEM,
        mode: 'tarot',
        tarotDraw: '   ',
      });

      expect(prompt).not.toContain('[[CARD]]');
    });
  });

  describe('switching reader', () => {
    const TAROT_PERSONA = 'TAROT_BLOB You read cards.';
    const DRAW = 'The Tower (reversed) — upheaval. The structure was never sound.';

    /** A completed astrology turn as this module now writes them. */
    const astrologyTurn = () =>
      visible({ prompt: `[[READER:astrology]] ${SYSTEM}\n\n[[NOW]] is he into me` });

    it('marks the reader on the turn that opens a conversation', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'should I text him',
        systemContext: SYSTEM,
        mode: 'astrology',
      });

      expect(prompt).toContain('[[READER:astrology]]');
      expect(prompt).not.toContain('[[READER_CHANGE]]');
    });

    it('does not re-send the persona while the reader is unchanged', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'why though',
        systemContext: SYSTEM,
        mode: 'astrology',
        history: [astrologyTurn()],
      });

      expect(prompt).toBe('[[NOW]] why though');
    });

    it('re-sends the persona and hands the conversation over on a switch', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'pull me something',
        systemContext: TAROT_PERSONA,
        mode: 'tarot',
        tarotDraw: DRAW,
        history: [astrologyTurn()],
      });

      expect(prompt).toContain(`[[READER:tarot]] ${TAROT_PERSONA}`);
      expect(prompt).toContain('[[READER_CHANGE]]');
      expect(prompt).toContain('from the astrologer to the tarot reader');
      // A handover, not a fresh start.
      expect(prompt).toContain('do not start the conversation over');
      expect(prompt).toContain(DRAW);
    });

    it('names the direction of the switch the other way too', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'what does my chart say',
        systemContext: SYSTEM,
        mode: 'astrology',
        history: [
          visible({ prompt: `[[READER:tarot]] ${TAROT_PERSONA} [[CARD]] ${DRAW}` }),
        ],
      });

      expect(prompt).toContain('from the tarot reader to the astrologer');
      expect(prompt).toContain('Stop pulling cards');
    });

    it('inherits the reader a switch established, without repeating it', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'and after that',
        systemContext: TAROT_PERSONA,
        mode: 'tarot',
        tarotDraw: DRAW,
        history: [
          astrologyTurn(),
          visible({ prompt: `[[READER:tarot]] ${TAROT_PERSONA} [[READER_CHANGE]] …` }),
        ],
      });

      expect(prompt).not.toContain(TAROT_PERSONA);
      expect(prompt).not.toContain('[[READER_CHANGE]]');
      expect(prompt).toContain(DRAW);
    });

    it('switches back and forth without losing track of the anchor', () => {
      const history = [
        astrologyTurn(),
        visible({ prompt: `[[READER:tarot]] ${TAROT_PERSONA} [[READER_CHANGE]] …` }),
        visible({ prompt: `[[READER:astrology]] ${SYSTEM} [[READER_CHANGE]] …` }),
      ];

      expect(
        buildChatTurnPrompt({
          userMessage: 'still on the chart',
          systemContext: SYSTEM,
          mode: 'astrology',
          history,
        }),
      ).toBe('[[NOW]] still on the chart');

      expect(
        buildChatTurnPrompt({
          userMessage: 'cards again',
          systemContext: TAROT_PERSONA,
          mode: 'tarot',
          tarotDraw: DRAW,
          history,
        }),
      ).toContain('[[READER_CHANGE]]');
    });

    it('reads a pre-marker tarot thread off the draw it carried', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'what does my chart say',
        systemContext: SYSTEM,
        mode: 'astrology',
        history: [visible({ prompt: `${TAROT_PERSONA} [[CARD]] ${DRAW}` })],
      });

      expect(prompt).toContain('from the tarot reader to the astrologer');
    });

    it('reads a pre-marker astrology thread as astrology', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'go on',
        systemContext: SYSTEM,
        mode: 'astrology',
        history: [visible({ prompt: `${SYSTEM} User: hi` })],
      });

      expect(prompt).toBe('[[NOW]] go on');
    });

    it('opens rather than hands over when no earlier turn is replayable', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'pull me something',
        systemContext: TAROT_PERSONA,
        mode: 'tarot',
        tarotDraw: DRAW,
        history: [visible({ response: null, isError: true })],
      });

      expect(prompt).toContain(`[[READER:tarot]] ${TAROT_PERSONA}`);
      expect(prompt).not.toContain('[[READER_CHANGE]]');
    });

    it('keeps [[NOW]] last when a switch lands on the same turn as a card', () => {
      const prompt = buildChatTurnPrompt({
        userMessage: 'pull me something',
        systemContext: TAROT_PERSONA,
        mode: 'tarot',
        tarotDraw: DRAW,
        history: [astrologyTurn()],
      });

      expect(prompt.indexOf('[[READER_CHANGE]]')).toBeLessThan(
        prompt.indexOf('[[CARD]]'),
      );
      expect(prompt.endsWith('[[NOW]] pull me something')).toBe(true);
    });
  });

  describe('the switch budget', () => {
    const handover = (reader: string) =>
      visible({ prompt: `[[READER:${reader}]] PERSONA [[READER_CHANGE]] …` });

    it('counts no switches in a thread that has never changed reader', () => {
      expect(readerSwitchesUsed([])).toBe(0);
      expect(readerSwitchesUsed([visible({ prompt: `[[READER:astrology]] ${SYSTEM}` })])).toBe(
        0,
      );
    });

    it('counts one per handover the model will be replayed', () => {
      expect(
        readerSwitchesUsed([
          visible({ prompt: `[[READER:astrology]] ${SYSTEM}` }),
          handover('tarot'),
          visible(),
          handover('astrology'),
        ]),
      ).toBe(2);
    });

    it('does not count a handover the extension will never replay', () => {
      expect(
        readerSwitchesUsed([
          // Failed, so it is dropped from the replay along with its persona.
          { ...handover('tarot'), response: null, isError: true },
          // Restored from a saved session — no prompt, nothing replayed.
          { ...restored(), prompt: '' },
        ]),
      ).toBe(0);
    });

    it('counts what buildChatTurnPrompt actually writes', () => {
      const history: ContinuityTurn[] = [
        visible({ prompt: `[[READER:astrology]] ${SYSTEM}` }),
      ];

      for (let i = 0; i < MAX_READER_SWITCHES; i++) {
        const prompt = buildChatTurnPrompt({
          userMessage: 'switch',
          systemContext: SYSTEM,
          mode: i % 2 === 0 ? 'tarot' : 'astrology',
          history,
        });
        history.push(visible({ prompt }));
      }

      expect(readerSwitchesUsed(history)).toBe(MAX_READER_SWITCHES);
    });
  });

  it('stays inside the 32000-char limit SendChatMessageSchema enforces', () => {
    const prompt = buildChatTurnPrompt({
      userMessage: 'hi',
      systemContext: 'S'.repeat(20000),
      natalChartSummary: 'C'.repeat(20000),
      history: Array.from({ length: 20 }, () =>
        restored({ response: 'y'.repeat(2000) }),
      ),
    });

    expect(prompt.length).toBeLessThanOrEqual(32000);
  });
});
