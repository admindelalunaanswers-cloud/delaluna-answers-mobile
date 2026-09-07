import { useCallback, useEffect, useState } from 'react';

import {
  BLOCKABLE_FEATURES,
  DURATIONS,
  ENTITLEMENT_IDS,
  FEATURE_LABELS,
  getModeration,
  setEntitlement,
  setUserDisabled,
  setUserFeatureBlocks,
  type BlockableFeature,
  type Duration,
  type EntitlementId,
  type ModerationState,
} from '../lib/moderation';

/**
 * Every destructive control here confirms first. These actions are invisible to
 * the person they land on until they next open the app, so a misclick is not
 * self-correcting — there is no "wait, why is this greyed out" moment for the
 * admin, only a support ticket a week later.
 */
function confirmAction(message: string): boolean {
  return window.confirm(message);
}

export default function ModerationPanel({
  uid,
  email,
  isTargetAdmin,
}: {
  uid: string;
  email?: string;
  isTargetAdmin?: boolean;
}) {
  const [state, setState] = useState<ModerationState | null>(null);
  const [draft, setDraft] = useState<BlockableFeature[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [entitlement, setEnt] = useState<EntitlementId>(ENTITLEMENT_IDS[0]);
  const [duration, setDuration] = useState<Duration>('monthly');

  const load = useCallback(async () => {
    setError(null);
    try {
      const m = await getModeration(uid);
      setState(m);
      setDraft(m.blockedFeatures);
      setNote(m.note);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setOk(null);
    try {
      await fn();
      await load();
      setOk(`${label} — done.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <div className="card">
        <h2 className="card-title">Moderation</h2>
        <p className="muted" style={{ margin: 0 }}>
          {error ?? 'Loading…'}
        </p>
      </div>
    );
  }

  // The server refuses these actions against another admin; saying so up front
  // beats letting her click and read a failed-precondition error.
  if (isTargetAdmin) {
    return (
      <div className="card">
        <h2 className="card-title">Moderation</h2>
        <div className="msg info" style={{ marginBottom: 0 }}>
          This account is an admin. Moderation actions are refused against
          admins — remove the address from <span className="mono">ADMIN_EMAILS</span>{' '}
          first.
        </div>
      </div>
    );
  }

  const dirty =
    draft.length !== state.blockedFeatures.length ||
    draft.some((f) => !state.blockedFeatures.includes(f));

  function toggle(f: BlockableFeature) {
    setDraft((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f],
    );
  }

  return (
    <div className="card">
      <h2 className="card-title">Moderation & access</h2>

      {error && <div className="msg error">{error}</div>}
      {ok && <div className="msg ok">{ok}</div>}

      {/* ── Account access ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div className="row">
          <span className="row-label">Account access</span>
          <span className="row-value">
            {state.disabled ? (
              <span className="pill danger">disabled</span>
            ) : (
              <span className="pill ok">active</span>
            )}
          </span>
        </div>

        <p className="faint" style={{ fontSize: 12.5, margin: '8px 0 10px' }}>
          Disabling signs the user out everywhere and blocks sign-in. Their data
          is untouched and re-enabling restores access — they just sign in
          again.
        </p>

        {state.disabled ? (
          <button
            className="secondary"
            disabled={busy !== null}
            onClick={() =>
              void run('Re-enabled account', () =>
                setUserDisabled(uid, false, note),
              )
            }
          >
            {busy === 'Re-enabled account' ? 'Working…' : 'Re-enable account'}
          </button>
        ) : (
          <button
            className="danger"
            disabled={busy !== null}
            onClick={() => {
              if (
                confirmAction(
                  `Disable ${email ?? uid}?\n\nThey will be signed out on every device and cannot sign in until re-enabled.`,
                )
              ) {
                void run('Disabled account', () =>
                  setUserDisabled(uid, true, note),
                );
              }
            }}
          >
            {busy === 'Disabled account' ? 'Working…' : 'Disable account'}
          </button>
        )}
      </div>

      {/* ── Feature blocks ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, margin: '0 0 4px' }}>Feature blocks</h3>
        <p className="faint" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          Blocking chat also blocks tarot — tarot answers run through the same
          pipeline, so leaving it open would be a hole rather than a finer
          setting.
        </p>

        {BLOCKABLE_FEATURES.map((f) => {
          const implied = f === 'tarot' && draft.includes('chat');
          return (
            <label
              key={f}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
                color: 'var(--text)',
                fontSize: 13.5,
              }}
            >
              <input
                type="checkbox"
                style={{ width: 'auto' }}
                checked={draft.includes(f) || implied}
                disabled={implied || busy !== null}
                onChange={() => toggle(f)}
              />
              {FEATURE_LABELS[f]}
              {implied && (
                <span className="faint" style={{ fontSize: 12 }}>
                  (implied by chat block)
                </span>
              )}
            </label>
          );
        })}

        <button
          style={{ marginTop: 8 }}
          disabled={!dirty || busy !== null}
          onClick={() => {
            const added = draft.filter(
              (f) => !state.blockedFeatures.includes(f),
            );
            const msg = added.length
              ? `Block ${added.map((f) => FEATURE_LABELS[f]).join(', ')} for ${email ?? uid}?`
              : `Update feature blocks for ${email ?? uid}?`;
            if (confirmAction(msg)) {
              void run('Updated feature blocks', () =>
                setUserFeatureBlocks(uid, draft, note),
              );
            }
          }}
        >
          {busy === 'Updated feature blocks' ? 'Saving…' : 'Save blocks'}
        </button>
      </div>

      {/* ── Premium grant ────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 13, margin: '0 0 4px' }}>Grant premium</h3>
        <p className="faint" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
          Writes a promotional entitlement in RevenueCat. It can take a moment
          to reach the app — the device refreshes on next launch or paywall
          open.
        </p>

        <div className="stack" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 170 }}>
            <label htmlFor="ent">Entitlement</label>
            <select
              id="ent"
              value={entitlement}
              onChange={(e) => setEnt(e.target.value as EntitlementId)}
            >
              {ENTITLEMENT_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label htmlFor="dur">Duration</label>
            <select
              id="dur"
              value={duration}
              onChange={(e) => setDuration(e.target.value as Duration)}
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={busy !== null}
            onClick={() =>
              void run('Granted entitlement', () =>
                setEntitlement(uid, entitlement, 'grant', duration),
              )
            }
          >
            {busy === 'Granted entitlement' ? 'Granting…' : 'Grant'}
          </button>
          <button
            className="secondary"
            disabled={busy !== null}
            onClick={() => {
              if (confirmAction(`Revoke "${entitlement}" from ${email ?? uid}?`)) {
                void run('Revoked entitlement', () =>
                  setEntitlement(uid, entitlement, 'revoke'),
                );
              }
            }}
          >
            {busy === 'Revoked entitlement' ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </div>

      {/* ── Note ─────────────────────────────────────────────────────────── */}
      <div>
        <label htmlFor="note">
          Internal note (saved with the next action, never shown to the user)
        </label>
        <input
          id="note"
          value={note}
          maxLength={500}
          placeholder="e.g. abusive messages, ticket #123"
          onChange={(e) => setNote(e.target.value)}
        />
        {state.updatedAt && (
          <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
            Last changed {state.updatedAt.toDate().toLocaleString()}
            {state.updatedBy && (
              <>
                {' '}
                by <span className="mono">{state.updatedBy.slice(0, 12)}…</span>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
