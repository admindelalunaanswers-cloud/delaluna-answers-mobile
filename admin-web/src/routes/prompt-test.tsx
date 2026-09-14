import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { runPrompt, type PromptResult } from '../lib/prompt-test';

/**
 * prompt-test.tsx — context in, prompt in, model out, reply and keep going.
 *
 * The session lives in localStorage rather than in component state alone. A
 * long context edit is expensive to retype and a multi-turn thread is
 * expensive to regenerate — this screen is one accidental refresh away from
 * losing both, and nothing here is worth protecting from the admin's own
 * browser.
 */
const SESSION_KEY = 'delaluna.promptTest.session';

interface Turn {
  prompt: string;
  response: string;
  model: string;
  elapsedMs: number;
}

interface Session {
  context: string;
  turns: Turn[];
  /**
   * The last turn's interaction id, sent as `previousInteractionId` on the
   * next one. Null means the next turn starts a fresh conversation.
   */
  interactionId: string | null;
}

const EMPTY: Session = { context: '', turns: [], interactionId: null };

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Session>) };
  } catch {
    return EMPTY;
  }
}

export default function PromptTest() {
  const [session, setSession] = useState<Session>(loadSession);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const started = session.turns.length > 0;

  useEffect(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      // A full or disabled localStorage must not break the screen.
    }
  }, [session]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session.turns.length, busy]);

  const send = useCallback(
    async (prompt: string) => {
      setBusy(true);
      setError(null);
      const result: PromptResult = await runPrompt({
        prompt,
        systemInstruction: session.context,
        // Undefined on the opening turn, which is what starts a new chain.
        previousInteractionId: session.interactionId ?? undefined,
      });
      setBusy(false);

      if (!result.ok) {
        // The prompt is deliberately left in the box on failure — a rejected
        // turn is usually one word away from working, and retyping it is the
        // one thing guaranteed to annoy.
        setError(`${result.error} (${result.elapsedMs}ms)`);
        return;
      }

      setInput('');
      setSession((s) => ({
        ...s,
        turns: [
          ...s.turns,
          {
            prompt,
            response: result.text,
            model: result.model,
            elapsedMs: result.elapsedMs,
          },
        ],
        interactionId: result.interactionId,
      }));
    },
    [session.context, session.interactionId],
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const prompt = input.trim();
    if (prompt) void send(prompt);
  }

  return (
    <>
      <h1 className="page-title">Prompt testing</h1>
      <p className="page-sub">
        Runs through the same <span className="mono">generateJson</span> path as
        the live features. Nothing is written to Firestore and no
        user&rsquo;s interaction chain is touched.
      </p>

      <div className="card">
        <h2 className="card-title">Context</h2>
        <textarea
          rows={started ? 3 : 8}
          value={session.context}
          disabled={started}
          onChange={(e) =>
            setSession((s) => ({ ...s, context: e.target.value }))
          }
          placeholder="System instruction. Leave empty to run with no persona."
        />
        <p className="faint" style={{ fontSize: 12, margin: '6px 0 0' }}>
          {session.context.length.toLocaleString()} chars
          {started && (
            <>
              {' '}
              · locked for this conversation — the model is already anchored to
              it. Start a new one to change it.
            </>
          )}
        </p>
      </div>

      {session.turns.map((turn, i) => (
        <div className="card" key={i}>
          <h2 className="card-title">Prompt {i + 1}</h2>
          <pre className="output prompt-echo">{turn.prompt}</pre>
          <div className="stack" style={{ margin: '10px 0 8px' }}>
            <span className="pill ok">{turn.model}</span>
            <span className="faint">{turn.elapsedMs.toLocaleString()}ms</span>
            <span className="faint">
              {turn.response.length.toLocaleString()} chars
            </span>
            <button
              type="button"
              className="secondary"
              onClick={() => void navigator.clipboard?.writeText(turn.response)}
            >
              Copy
            </button>
          </div>
          <pre className="output">{turn.response}</pre>
        </div>
      ))}

      {error && <div className="msg error">{error}</div>}

      <form className="card" onSubmit={onSubmit}>
        <h2 className="card-title">
          {started ? 'Reply' : 'Prompt'}
        </h2>
        <textarea
          rows={started ? 4 : 10}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            started
              ? 'Respond to the model — it remembers the turns above.'
              : 'Paste a built prompt, or write one.'
          }
        />
        <div className="stack" style={{ marginTop: 10 }}>
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? 'Generating…' : started ? 'Send reply' : 'Run prompt'}
          </button>
          {started && (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setSession((s) => ({ ...EMPTY, context: s.context }));
                setError(null);
              }}
            >
              New conversation
            </button>
          )}
          {busy && (
            <span className="faint">
              a long prompt can take 60s or more…
            </span>
          )}
        </div>
      </form>

      <div ref={endRef} />
    </>
  );
}
