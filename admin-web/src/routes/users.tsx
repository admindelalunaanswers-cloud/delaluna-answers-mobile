import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';

import ModerationPanel from '../components/moderation-panel';
import {
  getChatUsage,
  getSubscriber,
  getUser,
  searchUsers,
  type AdminUserDoc,
  type ChatUsage,
  type SubscriberInfo,
} from '../lib/users';

function fmtDate(ts?: Timestamp): string {
  if (!ts?.toDate) return '—';
  try {
    return ts.toDate().toLocaleString();
  } catch {
    return '—';
  }
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className="row-value">{children}</span>
    </div>
  );
}

function Bool({ value }: { value?: boolean }) {
  return (
    <span className={`pill ${value ? 'ok' : 'off'}`}>
      {value ? 'yes' : 'no'}
    </span>
  );
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function UserDetail({ uid }: { uid: string }) {
  const [user, setUser] = useState<AdminUserDoc | null | 'loading'>('loading');
  const [sub, setSub] = useState<SubscriberInfo | null>(null);
  const [usage, setUsage] = useState<ChatUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUser('loading');
    setError(null);

    (async () => {
      try {
        const u = await getUser(uid);
        if (cancelled) return;
        setUser(u);
        if (!u) return;

        // Both are optional context; a missing mirror or ledger is normal and
        // must not blank out the profile above it.
        const [s, cu] = await Promise.all([
          getSubscriber(uid).catch(() => null),
          getChatUsage(uid, u.timezoneOffsetMinutes).catch(() => null),
        ]);
        if (cancelled) return;
        setSub(s);
        setUsage(cu);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (user === 'loading') return <p className="muted">Loading…</p>;
  if (error) return <div className="msg error">{error}</div>;
  if (!user) {
    return (
      <div className="msg error">
        No user document at <span className="mono">users/{uid}</span>.
      </div>
    );
  }

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <h2 className="card-title">Account</h2>
          <Row label="Name">{user.fullName || '—'}</Row>
          <Row label="Email">
            <span className="mono">{user.email || '—'}</span>
          </Row>
          <Row label="Email verified">
            <Bool value={user.isEmailVerified} />
          </Row>
          <Row label="UID">
            <span className="mono">{user.uid}</span>
          </Row>
          <Row label="Pronouns">{user.pronouns || '—'}</Row>
          <Row label="Created">{fmtDate(user.createdAt)}</Row>
          <Row label="Last login">{fmtDate(user.lastLoggedInAt)}</Row>
          <Row label="Admin">
            <Bool value={user.isAdmin} />
          </Row>
        </div>

        <div className="card">
          <h2 className="card-title">Birth data</h2>
          <Row label="Birthday">{fmtDate(user.birthday)}</Row>
          <Row label="Birth time">
            {user.isBirthTimeUnknown ? (
              <span className="faint">unknown</span>
            ) : (
              user.birthtime || '—'
            )}
          </Row>
          <Row label="Place">{user.placeOfBirth || '—'}</Row>
          <Row label="TZ offset (min)">
            {user.timezoneOffsetMinutes ?? '—'}
          </Row>
          <Row label="Birth edits used">
            {user.birthDetailsChangeCount ?? 0} of 3
          </Row>
        </div>

        <div className="card">
          <h2 className="card-title">Subscription</h2>
          {/* isPremiumMember on the user doc is a stale display mirror; the
              RevenueCat data below is the real state. Both are shown so a
              divergence is visible rather than hidden. */}
          <Row label="isPremiumMember (doc)">
            <Bool value={user.isPremiumMember} />
          </Row>
          {sub === null ? (
            <p className="faint" style={{ fontSize: 12.5, marginBottom: 0 }}>
              No RevenueCat mirror document. Normal for an account that has
              never opened a paywall.
            </p>
          ) : (
            <>
              {sub.entitlements.length === 0 ? (
                <Row label="Entitlements">
                  <span className="faint">none</span>
                </Row>
              ) : (
                sub.entitlements.map((e) => (
                  <Row key={e.id} label={e.id}>
                    {e.expiresAt ? (
                      <span className="mono">
                        until {new Date(e.expiresAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="pill ok">lifetime</span>
                    )}
                  </Row>
                ))
              )}
              {sub.nonSubscriptions.map((n) => (
                <Row key={n.productId} label={n.productId}>
                  {n.count} purchased
                </Row>
              ))}
            </>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">Chat usage</h2>
          {!usage ? (
            <p className="faint" style={{ fontSize: 12.5, marginBottom: 0 }}>
              Could not read the ledger.
            </p>
          ) : (
            <>
              <Row label="Ledger day">
                <span className="mono">{usage.dayId}</span>
              </Row>
              <Row label="Metered">
                {/* A missing ledger is not a ledger reading zero — it means the
                    account is not being metered at all (admins, or pre-metering
                    builds). Conflating the two is a documented past bug. */}
                {usage.hasLedger ? (
                  <span className="pill ok">yes</span>
                ) : (
                  <span className="pill warn">no ledger</span>
                )}
              </Row>
              <Row label="Questions today">{usage.today}</Row>
              <Row label="Credits consumed (all time)">
                {usage.creditsConsumed}
              </Row>
            </>
          )}
        </div>
      </div>

      <ModerationPanel
        uid={user.uid}
        email={user.email}
        isTargetAdmin={user.isAdmin}
      />
    </>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

export default function Users() {
  const { uid } = useParams();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<AdminUserDoc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      setResults(await searchUsers(value));
    } catch (err) {
      setError((err as Error).message);
      setResults(null);
    } finally {
      setBusy(false);
    }
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void run(term);
  }

  return (
    <>
      <h1 className="page-title">Users</h1>
      <p className="page-sub">
        Search by email or UID. Matches are prefix-only — &ldquo;jea&rdquo;
        finds &ldquo;jeanai@…&rdquo;, but &ldquo;anai&rdquo; finds nothing.
      </p>

      <form className="card" onSubmit={onSubmit}>
        <div className="stack">
          <div style={{ flex: 1, minWidth: 220 }}>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="email or UID prefix (min 3 characters)"
              autoFocus
            />
          </div>
          <button type="submit" disabled={busy || term.trim().length < 3}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {error && <div className="msg error">{error}</div>}

      {results && results.length === 0 && (
        <div className="msg info">No users matched that prefix.</div>
      )}

      {results && results.length > 0 && (
        <div className="card" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>UID</th>
                <th>Premium</th>
              </tr>
            </thead>
            <tbody>
              {results.map((u) => (
                <tr key={u.uid} onClick={() => navigate(`/users/${u.uid}`)}>
                  <td className="mono">{u.email || '—'}</td>
                  <td>{u.fullName || '—'}</td>
                  <td className="mono faint">{u.uid.slice(0, 12)}…</td>
                  <td>
                    <Bool value={u.isPremiumMember} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {uid && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 15, marginBottom: 12 }}>
            <span className="faint">Detail · </span>
            <span className="mono">{uid}</span>
          </h2>
          <UserDetail uid={uid} />
        </div>
      )}
    </>
  );
}
